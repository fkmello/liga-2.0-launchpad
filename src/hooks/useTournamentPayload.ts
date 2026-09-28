import { useQuery } from '@tanstack/react-query';
import {
  USE_CONSOLIDATED_SERIE_A,
  USE_CONSOLIDATED_SERIE_B,
  USE_CONSOLIDATED_SERIE_C,
} from '@/config/featureFlags';
import { DEFAULT_SEASON, getTournamentCacheKey } from '@/config/tournamentCacheKeys';
import { callEdgeFunction, fetchManyFromCache } from '@/lib/sheetsCache';
import type {
  NormalizedMatch,
  NormalizedRound,
  NormalizedTournamentData,
  StandingRow,
} from '@/types/tournament';

/**
 * useTournamentPayload é o ÚNICO ponto autorizado a expor dados de torneio.
 * Ele resolve a origem (consolidado x legado), aplica o fallback quando
 * necessário e retorna SEMPRE um `NormalizedTournamentData`.
 *
 * Nada fora deste módulo conhece `fases`, `classificacao.grupos`,
 * `dados_externos.rows` nem as chaves legadas.
 */

export const TOURNAMENT_PAYLOAD_QUERY_KEY = 'tournament-payload';

const TOTAL_ROUNDS = 38;

/** Cada série só usa o contrato consolidado quando sua própria flag está ligada. */
export function isConsolidatedTournament(league: string): boolean {
  return (
    (USE_CONSOLIDATED_SERIE_A && league === 'serie_a') ||
    (USE_CONSOLIDATED_SERIE_B && league === 'serie_b') ||
    (USE_CONSOLIDATED_SERIE_C && league === 'serie_c')
  );
}

export function useTournamentPayload(league: string, season: number = DEFAULT_SEASON) {
  return useQuery<NormalizedTournamentData>({
    queryKey: [TOURNAMENT_PAYLOAD_QUERY_KEY, league, season],
    queryFn: () => loadTournamentData(league, season),
    enabled: isConsolidatedTournament(league),
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Resolução de origem (privado) ───────────────────────────────────────────

type FallbackReason = 'CACHE_MISS' | 'EMPTY_PAYLOAD' | 'READ_ERROR';

async function loadTournamentData(
  league: string,
  season: number,
): Promise<NormalizedTournamentData> {
  let reason: FallbackReason | null = null;

  try {
    const key = getTournamentCacheKey(league, season);
    const rows = await fetchManyFromCache([key]);
    const payload = rows.get(key);
    if (!payload) {
      reason = 'CACHE_MISS';
    } else {
      const normalized = fromConsolidated(payload);
      if (!normalized) reason = 'EMPTY_PAYLOAD';
      else return normalized;
    }
  } catch {
    reason = 'READ_ERROR';
  }

  // TODO: remover pós-promoção da shadow para a cache oficial.
  console.warn(`[SerieA] Fallback para legado: ${reason}`);
  return await loadLegacy(league);
}

// ─── Origem consolidada (privado) ────────────────────────────────────────────

function fromConsolidated(payload: any): NormalizedTournamentData | null {
  const fases = payload?.fases;
  const grupos = payload?.classificacao?.grupos;
  const externas = payload?.dados_externos?.rows;
  if (!fases || !grupos || !Array.isArray(externas)) return null;

  const matchesByRound: Record<number, NormalizedRound | undefined> = {};
  for (const [key, value] of Object.entries<any>(fases)) {
    const match = /^rodada_(\d+)$/.exec(key);
    if (!match) continue;
    matchesByRound[Number(match[1])] = {
      tournament: String(value?.tournament ?? ''),
      round: String(value?.round ?? ''),
      matches: (value?.matches ?? []).map(toNormalizedMatch),
    };
  }

  const standings = sortStandings(
    (grupos.geral ?? []).map((row: any, idx: number) => ({
      teamName: String(row?.teamName ?? '').trim(),
      played: num(row?.played),
      wins: num(row?.wins),
      draws: num(row?.draws),
      losses: num(row?.losses),
      goalsFor: num(row?.goalsFor),
      goalsAgainst: num(row?.goalsAgainst),
      goalDiff: num(row?.goalDiff),
      points: num(row?.points),
      position: num(row?.position) || idx + 1,
    })),
  );

  const externalRows = externas.map((row: any) =>
    Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : [],
  );

  if (!standings.length && !Object.keys(matchesByRound).length) return null;

  return { matchesByRound, standings, externalRows };
}

// ─── Origem legada (privado) ─────────────────────────────────────────────────

async function loadLegacy(league: string): Promise<NormalizedTournamentData> {
  const roundKeys = Array.from(
    { length: TOTAL_ROUNDS },
    (_, i) => `resultados:${league}:${i + 1}`,
  );
  const classKey = `classificacao:${league}`;
  const externalKey = `dados_externos:${league}`;

  const rows = await fetchManyFromCache([...roundKeys, classKey, externalKey]);

  const matchesByRound: Record<number, NormalizedRound | undefined> = {};
  roundKeys.forEach((key, idx) => {
    const value = rows.get(key);
    if (!value) return;
    matchesByRound[idx + 1] = {
      tournament: String(value?.tournament ?? ''),
      round: String(value?.round ?? ''),
      matches: (value?.matches ?? []).map(toNormalizedMatch),
    };
  });

  let classificacao = rows.get(classKey);
  if (!classificacao) {
    classificacao = await callEdgeFunction({ action: 'classificacao', league }).catch(() => null);
  }

  let externas = rows.get(externalKey);
  if (!externas) {
    externas = await callEdgeFunction({ action: 'dados_externos', league }).catch(() => null);
  }

  return {
    matchesByRound,
    standings: standingsFromMatrix(classificacao?.data ?? []),
    externalRows: (externas?.rows ?? []).map((row: any) =>
      Array.isArray(row) ? row.map((cell: unknown) => String(cell ?? '')) : [],
    ),
  };
}

/**
 * Matriz da planilha legada -> `StandingRow[]`.
 * Layout: cabeçalho em data[2], linhas a partir de data[3].
 * Colunas: 1=posição, 3=time, 4=P, 5=J, 6=V, 7=E, 8=D, 9=GP, 10=GC, 11=SG.
 */
function standingsFromMatrix(matrix: string[][]): StandingRow[] {
  if (!Array.isArray(matrix) || matrix.length < 4) return [];
  const rows = matrix.slice(3).filter((row) => row?.some((cell) => cell?.trim()));

  return sortStandings(
    rows.map((row, idx) => ({
      teamName: (row[3] ?? '').trim(),
      played: ptNum(row[5]),
      wins: ptNum(row[6]),
      draws: ptNum(row[7]),
      losses: ptNum(row[8]),
      goalsFor: ptNum(row[9]),
      goalsAgainst: ptNum(row[10]),
      goalDiff: ptNum(row[11]),
      points: ptNum(row[4]),
      position: ptNum(row[1]) || idx + 1,
    })),
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNormalizedMatch(match: any, idx: number): NormalizedMatch {
  return {
    team1: String(match?.team1 ?? ''),
    team2: String(match?.team2 ?? ''),
    score1: match?.score1 != null ? String(match.score1) : undefined,
    score2: match?.score2 != null ? String(match.score2) : undefined,
    matchOrder: Number(match?.matchOrder ?? idx + 1),
    league: match?.league ? String(match.league) : undefined,
  };
}

/** Critérios: Pontos > Vitórias > Saldo de gols > Gols pró. Reposiciona 1..N. */
function sortStandings(rows: StandingRow[]): StandingRow[] {
  return [...rows]
    .sort((a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      b.goalDiff - a.goalDiff ||
      b.goalsFor - a.goalsFor,
    )
    .map((row, idx) => ({ ...row, position: idx + 1 }));
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ptNum(value: string | undefined): number {
  return parseFloat((value || '0').replace(/\./g, '').replace(',', '.')) || 0;
}
