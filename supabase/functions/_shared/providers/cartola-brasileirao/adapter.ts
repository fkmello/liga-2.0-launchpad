import type { AdapterContext, TournamentAdapter } from '../../tournament/types.ts';
import type { MatchInput } from '../../standings/types.ts';
import { KnownProviders } from '../../sync/providers.ts';
import {
  fetchCartolaTeams,
  fetchMercadoStatus,
  fetchTeamsRoundScores,
  type CartolaTeamRaw,
} from './api-client.ts';

interface BrasileiraoRaw {
  teams: CartolaTeamRaw[];
  matches: MatchInput[];
  fases: Record<string, unknown>;
}

function normalizeName(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function externalRows(ctx: AdapterContext): any[] {
  return (ctx.previous?.dados_externos?.rows ?? []) as any[];
}

/** O layout de `dados_externos` varia (4 ou 6 colunas): pega o 1º valor numérico. */
function rowId(row: any): string {
  if (!Array.isArray(row)) {
    const id = row?.id_cartola ?? row?.id;
    return id === undefined || id === null ? '' : String(id).trim();
  }
  for (const cell of [row[3], row[1], ...row]) {
    const v = String(cell ?? '').trim();
    if (/^\d{3,}$/.test(v)) return v;
  }
  return '';
}


function extractIds(ctx: AdapterContext): string[] {
  const ids = new Set<string>();
  for (const row of externalRows(ctx)) {
    const id = rowId(row);
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Mapa nome normalizado -> id_cartola, a partir de `dados_externos`. */
function buildIdByName(ctx: AdapterContext): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of externalRows(ctx)) {
    const id = rowId(row);
    if (!id) continue;
    const names = Array.isArray(row) ? [row[0], row[2]] : [row?.nome, row?.time];
    for (const n of names) {
      const key = normalizeName(n);
      if (key && !map.has(key)) map.set(key, id);
    }
  }
  return map;
}

/** Formata a pontuação preservando o padrão textual dos placares existentes. */
function formatScore(pontos: number): string {
  return pontos.toFixed(2).replace('.', ',');
}

/**
 * Confrontos vêm do baseline consolidado (fases.rodada_N.matches).
 * Os placares da rodada-alvo são substituídos pela pontuação real da API.
 */
function extractMatches(
  ctx: AdapterContext,
  targetRound: number | null,
  scores: Map<string, number | null>,
  idByName: Map<string, string>,
): { matches: MatchInput[]; fases: Record<string, unknown> } {
  const prevFases = (ctx.previous?.fases ?? {}) as Record<string, any>;
  const targetKey = targetRound !== null ? `rodada_${targetRound}` : null;
  const fases: Record<string, unknown> = { ...prevFases };
  const matches: MatchInput[] = [];
  const scoped =
    ctx.scope.kind === 'rodada' ? [`rodada_${ctx.scope.rodada}`] : Object.keys(prevFases);

  const scoreFor = (team: unknown, previous: unknown): unknown => {
    const id = idByName.get(normalizeName(team));
    if (!id) return previous;
    const pontos = scores.get(id);
    if (pontos === undefined || pontos === null) return previous;
    return formatScore(pontos);
  };

  if (targetKey && prevFases[targetKey]) {
    const fase = prevFases[targetKey];
    fases[targetKey] = {
      ...fase,
      matches: (fase.matches ?? []).map((m: any) => {
        const home = m.team1 ?? m.home;
        const away = m.team2 ?? m.away;
        if (!home || !away) return m;
        return { ...m, score1: scoreFor(home, m.score1), score2: scoreFor(away, m.score2) };
      }),
    };
  }

  for (const key of scoped) {
    const fase = (fases as Record<string, any>)[key];
    for (const m of fase?.matches ?? []) {
      const home = m.team1 ?? m.home;
      const away = m.team2 ?? m.away;
      if (!home || !away) continue;
      matches.push({
        group: 'geral',
        round: key,
        homeId: String(home),
        awayId: String(away),
        homeName: String(home),
        awayName: String(away),
        homeGoals: toNum(m.score1),
        awayGoals: toNum(m.score2),
      });
    }
  }
  return { matches, fases };
}

export function createCartolaBrasileiraoAdapter(
  id: string,
): TournamentAdapter<BrasileiraoRaw> {
  return {
  id,
  provider: KnownProviders.CARTOLA_BRASILEIRAO,
  source_type: 'api',

  async fetchRaw(ctx) {
    // Status do mercado buscado UMA vez e compartilhado com todo o adapter.
    const { rodada_atual, status_mercado } = await fetchMercadoStatus();
    
    // SYNC_1 (mercado aberto): API já mudou para a nova rodada, mas queremos 
    // consolidar os placares FINAIS da rodada que acabou de encerrar.
    const targetRound =
      rodada_atual === null ? null : status_mercado === 1 ? rodada_atual - 1 : rodada_atual;

    const ids = extractIds(ctx);
    const teams = ids.length ? await fetchCartolaTeams(ids) : [];

    const scores =
      ids.length && targetRound !== null && targetRound > 0
        ? await fetchTeamsRoundScores(ids, targetRound)
        : new Map<string, number | null>();

    const { matches, fases } = extractMatches(ctx, targetRound, scores, buildIdByName(ctx));
    return { teams, matches, fases };
  },

  toFases(raw) {
    return raw.fases;
  },

  toDadosExternos(raw, ctx) {
    const byId = new Map(raw.teams.map((t) => [t.id_cartola, t]));
    const byName = new Map(raw.teams.map((t) => [normalizeName(t.nome), t]));
    const prev = (ctx.previous?.dados_externos?.rows ?? []) as any[];
    if (!prev.length) {
      return { rows: raw.teams.map((t) => [t.nome, t.id_cartola, t.escudo ?? '']) };
    }
    const rows = prev.map((row) => {
      if (!Array.isArray(row)) return row;
      const id = rowId(row);
      const team = byId.get(id) ?? byName.get(normalizeName(row[0] ?? row[2]));
      if (!team?.escudo) return row;
      const next = [...row];
      const shieldIdx = next.length > 5 ? 5 : next.length - 1;
      next[shieldIdx] = team.escudo;
      return next;
    });
    return { rows };
  },

  toMatches(raw) {
    return raw.matches;
  },
  };
}

export const cartolaBrasileiraoAdapter = createCartolaBrasileiraoAdapter(
  'cartola_brasileirao_serie_a_v1',
);
