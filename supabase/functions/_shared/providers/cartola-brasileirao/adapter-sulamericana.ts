import type { AdapterContext, TournamentAdapter } from '../../tournament/types.ts';
import { KnownProviders } from '../../sync/providers.ts';
import { fetchCartolaTeams, fetchMercadoStatus, fetchTeamsRoundScores, type CartolaTeamRaw } from './api-client.ts';

type FinalMatch = Record<string, any>;
type Fases = Record<string, any>;
interface SulamericanaRaw {
  fases: Fases;
  classificacao: { grupos: Record<string, unknown[]> };
  teams: CartolaTeamRaw[];
}

/** A Sul-Americana 2026 decide a final e o terceiro lugar em jogo único na rodada 37. */
export const SULAMERICANA_SYNCABLE_TARGET_ROUNDS = [37];

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
function normalizeName(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
function toScore(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const score = Number(String(value).replace(',', '.'));
  return Number.isFinite(score) ? score.toFixed(2).replace('.', ',') : null;
}

/** Atualiza somente os dois jogos únicos da fase Final; placares ausentes preservam o cache. */
export function updateSulamericanaFinal(
  fases: Fases,
  targetRound: number | null,
  scores: Map<string, number | null>,
  idByName: Map<string, string>,
): Fases {
  if (targetRound !== 37) return fases;
  const final = fases?.Final;
  if (!Array.isArray(final?.matches)) return fases;
  return {
    ...fases,
    Final: {
      ...final,
      matches: final.matches.map((match: FinalMatch) => {
        const id1 = idByName.get(normalizeName(match.team1));
        const id2 = idByName.get(normalizeName(match.team2));
        const score1 = id1 ? toScore(scores.get(id1)) : null;
        const score2 = id2 ? toScore(scores.get(id2)) : null;
        return {
          ...match,
          ...(score1 !== null ? { scoreIda1: score1 } : {}),
          ...(score2 !== null ? { scoreIda2: score2 } : {}),
        };
      }),
    },
  };
}

export const cartolaSulamericanaAdapter: TournamentAdapter<SulamericanaRaw> = {
  id: 'cartola_brasileirao_sulamericana_v1',
  provider: KnownProviders.CARTOLA_BRASILEIRAO,
  source_type: 'api',
  async fetchRaw(ctx) {
    let targetRound: number | null = null;
    if (ctx.scope.kind === 'rodada') targetRound = ctx.scope.rodada;
    else if (ctx.scope.kind !== 'dados_externos') {
      const market = await fetchMercadoStatus();
      targetRound = market.rodada_atual === null ? null
        : market.status_mercado === 1 ? market.rodada_atual - 1
        : market.status_mercado === 2 ? market.rodada_atual : null;
    }

    if (ctx.scope.kind === 'fase' && ctx.scope.fase !== 'Final') {
      throw new Error(`A Sul-Americana 2026 só possui sincronização de placares na fase Final (rodada 37); fase solicitada: "${ctx.scope.fase}".`);
    }

    const rows = externalRows(ctx);
    const ids = [...new Set(rows.map(rowId).filter(Boolean))];
    const teams = ids.length ? await fetchCartolaTeams(ids) : [];
    const scores = targetRound === 37 ? await fetchTeamsRoundScores(ids, 37) : new Map<string, number | null>();
    const idByName = new Map<string, string>();
    for (const row of rows) {
      const name = normalizeName(rowName(row));
      const id = rowId(row);
      if (name && id && !idByName.has(name)) idByName.set(name, id);
    }

    return {
      fases: updateSulamericanaFinal((ctx.previous?.fases ?? {}) as Fases, targetRound, scores, idByName),
      classificacao: ctx.previous?.classificacao ?? { grupos: {} },
      teams,
    };
  },
  toFases(raw) { return raw.fases; },
  toClassificacao(raw) { return raw.classificacao; },
  toDadosExternos(raw, ctx) {
    const byId = new Map(raw.teams.map((team) => [team.id_cartola, team]));
    const previousRows = externalRows(ctx);
    if (!previousRows.length) return { rows: raw.teams.map((team) => [team.nome, team.id_cartola, team.escudo ?? '']) };
    return { rows: previousRows.map((row: any) => {
      const team = byId.get(rowId(row));
      if (!team?.escudo || !Array.isArray(row)) return row;
      const next = [...row]; next[2] = team.escudo; return next;
    }) };
  },
  toMatches() { return []; },
};
