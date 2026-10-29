import type { AdapterContext, TournamentAdapter } from '../../tournament/types.ts';
import { KnownProviders } from '../../sync/providers.ts';
import {
  fetchCartolaTeams,
  fetchMercadoStatus,
  fetchTeamsRoundScores,
  type CartolaTeamRaw,
} from '../cartola-brasileirao/api-client.ts';

type CupMatch = Record<string, any>;
type CupFases = Record<string, { matches?: CupMatch[]; [key: string]: unknown }>;

interface CopaBrasilRaw {
  fases: CupFases;
  teams: CartolaTeamRaw[];
}

type CupLeg = 'ida' | 'volta';

const ROUND_TO_PHASE_LEG: Record<number, { fase: string; leg: CupLeg }> = {
  5: { fase: '1ª Fase', leg: 'ida' },
  7: { fase: '1ª Fase', leg: 'volta' },
  13: { fase: '2ª Fase', leg: 'ida' },
  16: { fase: '2ª Fase', leg: 'volta' },
  21: { fase: 'Oitavas de Final', leg: 'ida' },
  22: { fase: 'Oitavas de Final', leg: 'volta' },
  25: { fase: 'Quartas de Final', leg: 'ida' },
  26: { fase: 'Quartas de Final', leg: 'volta' },
  34: { fase: 'Semifinal', leg: 'ida' },
  35: { fase: 'Semifinal', leg: 'volta' },
  38: { fase: 'Final', leg: 'ida' },
};

/** Rodadas da API que correspondem a fases mapeadas da Copa do Brasil. */
export const COPA_BRASIL_SYNCABLE_TARGET_ROUNDS = Object.keys(ROUND_TO_PHASE_LEG).map(Number);

function normalizeName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function toScore(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const score = Number(String(value).replace(',', '.'));
  return Number.isFinite(score) ? score.toFixed(2).replace('.', ',') : null;
}

function externalRows(ctx: AdapterContext): unknown[] {
  return (ctx.previous?.dados_externos?.rows ?? []) as unknown[];
}

function rowName(row: any): string {
  return String(Array.isArray(row) ? row[0] ?? '' : row?.nome ?? row?.team_name ?? row?.time ?? '').trim();
}

function rowId(row: any): string {
  const value = Array.isArray(row) ? row[1] : row?.id_cartola ?? row?.id;
  return value === null || value === undefined ? '' : String(value).trim();
}

function extractIds(ctx: AdapterContext): string[] {
  return [...new Set(externalRows(ctx).map(rowId).filter(Boolean))];
}

function buildIdByName(ctx: AdapterContext): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of externalRows(ctx)) {
    const name = normalizeName(rowName(row));
    const id = rowId(row);
    if (name && id && !map.has(name)) map.set(name, id);
  }
  return map;
}

/**
 * Atualiza somente a perna correspondente à rodada já pontuada.
 * Campos sem pontuação nova preservam o valor anterior.
 */
export function updateCopaBrasilFases(
  fases: CupFases,
  targetRound: number | null,
  scores: Map<string, number | null>,
  idByName: Map<string, string>,
  onlyPhase?: string,
): CupFases {
  const target = targetRound === null ? undefined : ROUND_TO_PHASE_LEG[targetRound];
  if (!target || (onlyPhase && onlyPhase !== target.fase)) return fases;

  const next: CupFases = { ...fases };
  const fase = fases[target.fase];
  if (!fase || !Array.isArray(fase.matches)) return fases;

  const scoreKey1 = target.leg === 'ida' ? 'scoreIda1' : 'scoreVolta1';
  const scoreKey2 = target.leg === 'ida' ? 'scoreIda2' : 'scoreVolta2';

  next[target.fase] = {
    ...fase,
    matches: fase.matches.map((match) => {
      const id1 = idByName.get(normalizeName(match.team1));
      const id2 = idByName.get(normalizeName(match.team2));
      const score1 = id1 ? toScore(scores.get(id1)) : null;
      const score2 = id2 ? toScore(scores.get(id2)) : null;
      return {
        ...match,
        ...(score1 !== null ? { [scoreKey1]: score1 } : {}),
        ...(score2 !== null ? { [scoreKey2]: score2 } : {}),
      };
    }),
  };
  return next;
}


function parseCopaScore(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const score = Number(String(value).replace(',', '.'));
  return Number.isFinite(score) ? score : null;
}

function resolveCopaTwoLegMatch(match: CupMatch): { winner: string; loser: string } | null {
  if (!match?.team1 || !match?.team2) return null;
  if (match.manualWinner === match.team1) return { winner: match.team1, loser: match.team2 };
  if (match.manualWinner === match.team2) return { winner: match.team2, loser: match.team1 };
  const ida1 = parseCopaScore(match.scoreIda1);
  const ida2 = parseCopaScore(match.scoreIda2);
  const volta1 = parseCopaScore(match.scoreVolta1);
  const volta2 = parseCopaScore(match.scoreVolta2);
  if (ida1 === null || ida2 === null || volta1 === null || volta2 === null) return null;
  const total1 = ida1 + volta1;
  const total2 = ida2 + volta2;
  if (total1 === total2) return null;
  return total1 > total2
    ? { winner: match.team1, loser: match.team2 }
    : { winner: match.team2, loser: match.team1 };
}

function resolveCopaSingleMatch(match: CupMatch): { winner: string; loser: string } | null {
  if (!match?.team1 || !match?.team2) return null;
  if (match.manualWinner === match.team1) return { winner: match.team1, loser: match.team2 };
  if (match.manualWinner === match.team2) return { winner: match.team2, loser: match.team1 };
  const score1 = parseCopaScore(match.scoreIda1);
  const score2 = parseCopaScore(match.scoreIda2);
  if (score1 === null || score2 === null || score1 === score2) return null;
  return score1 > score2
    ? { winner: match.team1, loser: match.team2 }
    : { winner: match.team2, loser: match.team1 };
}

/** Progressão limitada a 2026: preserva o sorteio existente e só preenche a final após a volta. */
export function resolveCopaBrasil2026Final(fases: CupFases, teams: CartolaTeamRaw[]): CupFases {
  let nextFases: CupFases = { ...fases };
  const semis = nextFases['Semifinal']?.matches;
  const finalPhase = nextFases['Final'];
  const badgeByName = new Map(teams.map((team) => [normalizeName(team.nome), team.escudo ?? '']));

  if (Array.isArray(semis) && semis.length === 2 &&
      Array.isArray(finalPhase?.matches) && finalPhase.matches.length >= 2) {
    const results = semis.map(resolveCopaTwoLegMatch);
    if (results.every(Boolean)) {
      const matches = finalPhase.matches.map((match: CupMatch) => {
        const thirdPlace = normalizeName(match.matchNumber).includes('3') ||
          normalizeName(match.matchNumber).includes('terceirolugar');
        const team1 = thirdPlace ? results[0]!.loser : results[0]!.winner;
        const team2 = thirdPlace ? results[1]!.loser : results[1]!.winner;
        const samePair = match.team1 === team1 && match.team2 === team2;
        const updated = {
          ...match,
          team1,
          team2,
          team1Badge: badgeByName.get(normalizeName(team1)) ?? '',
          team2Badge: badgeByName.get(normalizeName(team2)) ?? '',
        };
        if (!samePair) {
          updated.scoreIda1 = '';
          updated.scoreIda2 = '';
          updated.scoreVolta1 = '';
          updated.scoreVolta2 = '';
          delete updated.manualWinner;
        }
        return updated;
      });
      nextFases = { ...nextFases, Final: { ...finalPhase, isFinal: true, matches } };
    }
  }

  const currentFinal = nextFases['Final'];
  if (!Array.isArray(currentFinal?.matches)) return nextFases;
  const finalMatch = currentFinal.matches.find((match: CupMatch) =>
    normalizeName(match.matchNumber).includes('final') && !normalizeName(match.matchNumber).includes('lugar')
  );
  const thirdPlaceMatch = currentFinal.matches.find((match: CupMatch) =>
    normalizeName(match.matchNumber).includes('3') || normalizeName(match.matchNumber).includes('terceirolugar')
  );
  const finalResult = finalMatch ? resolveCopaSingleMatch(finalMatch) : null;
  const thirdResult = thirdPlaceMatch ? resolveCopaSingleMatch(thirdPlaceMatch) : null;
  if (finalResult && thirdResult) {
    return {
      ...nextFases,
      Final: {
        ...currentFinal,
        isFinal: true,
        podium: [
          { position: 1, team: finalResult.winner, badge: badgeByName.get(normalizeName(finalResult.winner)) ?? '' },
          { position: 2, team: finalResult.loser, badge: badgeByName.get(normalizeName(finalResult.loser)) ?? '' },
          { position: 3, team: thirdResult.winner, badge: badgeByName.get(normalizeName(thirdResult.winner)) ?? '' },
        ],
      },
    };
  }
  if (currentFinal.podium) {
    const { podium: _oldPodium, ...withoutPodium } = currentFinal;
    return { ...nextFases, Final: { ...withoutPodium, isFinal: true } };
  }
  return { ...nextFases, Final: { ...currentFinal, isFinal: true } };
}

export const cartolaCopaBrasilAdapter: TournamentAdapter<CopaBrasilRaw> = {
  id: 'cartola_brasileirao_copa_brasil_v1',
  provider: KnownProviders.CARTOLA_BRASILEIRAO,
  source_type: 'api',

  async fetchRaw(ctx) {
    const fases = (ctx.previous?.fases ?? {}) as CupFases;
    const ids = extractIds(ctx);
    const teams = ids.length ? await fetchCartolaTeams(ids) : [];

    // A Sync #1 ocorre com o mercado aberto e consolida a rodada anterior.
    // Para testes/reparos manuais, scope=rodada permite apontar a rodada exata.
    let targetRound: number | null = null;
    if (ctx.scope.kind === 'rodada') {
      targetRound = ctx.scope.rodada;
    } else if (ctx.scope.kind !== 'dados_externos') {
      const market = await fetchMercadoStatus();
      targetRound = market.rodada_atual === null
        ? null
        : market.status_mercado === 1
          ? market.rodada_atual - 1
          : market.status_mercado === 2
            ? market.rodada_atual
            : null;
    }

    // scope=fase não informa ida/volta. Só atualizamos quando a rodada
    // determinada pelo mercado pertence à fase solicitada; caso contrário,
    // falhamos explicitamente em vez de retornar sucesso sem atualizar nada.
    if (ctx.scope.kind === 'fase') {
      const mappedPhase = targetRound === null ? undefined : ROUND_TO_PHASE_LEG[targetRound];
      if (!mappedPhase || mappedPhase.fase !== ctx.scope.fase) {
        throw new Error(
          `Não é possível atualizar a fase "${ctx.scope.fase}" pela rodada ${targetRound ?? 'indisponível'}. Informe scope=rodada com a rodada de ida/volta desejada.`,
        );
      }
    }

    const mapped = targetRound === null ? undefined : ROUND_TO_PHASE_LEG[targetRound];
    const idsForScores = mapped ? ids : [];
    const scores = idsForScores.length && targetRound !== null && targetRound > 0
      ? await fetchTeamsRoundScores(idsForScores, targetRound)
      : new Map<string, number | null>();

    const onlyPhase = ctx.scope.kind === 'fase' ? ctx.scope.fase : undefined;
    const updatedFases = updateCopaBrasilFases(
      fases,
      targetRound,
      scores,
      buildIdByName(ctx),
      onlyPhase,
    );
    const progressedFases = ctx.season === 2026 && ctx.scope.kind !== 'dados_externos'
      ? resolveCopaBrasil2026Final(updatedFases, teams)
      : updatedFases;

    return { fases: progressedFases, teams };
  },

  toFases(raw) {
    return raw.fases;
  },

  toDadosExternos(raw, ctx) {
    const byId = new Map(raw.teams.map((team) => [team.id_cartola, team]));
    const prev = externalRows(ctx);
    if (!prev.length) {
      return { rows: raw.teams.map((team) => [team.nome, team.id_cartola, team.escudo ?? '']) };
    }

    const rows = prev.map((row: any) => {
      const team = byId.get(rowId(row));
      if (!team?.escudo || !Array.isArray(row)) return row;
      const next = [...row];
      next[2] = team.escudo;
      return next;
    });
    return { rows };
  },

  // A Copa do Brasil não gera classificação por pontos corridos.
  toMatches() {
    return [];
  },
};
