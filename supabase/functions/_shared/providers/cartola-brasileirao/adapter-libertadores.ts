import type { AdapterContext, TournamentAdapter } from '../../tournament/types.ts';
import { KnownProviders } from '../../sync/providers.ts';
import { fetchCartolaTeams, fetchMercadoStatus, fetchTeamsRoundScores, type CartolaTeamRaw } from './api-client.ts';

type ContinentalMatch = Record<string, any>;
type ContinentalFases = Record<string, any>;
type RoundTarget = { kind: 'group'; groupRound: number } | { kind: 'knockout'; fase: string; leg: 'ida' | 'volta' };
interface LibertadoresRaw {
  fases: ContinentalFases;
  classificacao: { grupos: Record<string, unknown[]> };
  teams: CartolaTeamRaw[];
}

const ROUND_TO_TARGET: Record<number, RoundTarget> = {
  11: { kind: 'group', groupRound: 1 }, 12: { kind: 'group', groupRound: 2 },
  14: { kind: 'group', groupRound: 3 }, 15: { kind: 'group', groupRound: 4 },
  17: { kind: 'group', groupRound: 5 }, 18: { kind: 'group', groupRound: 6 },
  23: { kind: 'knockout', fase: 'Oitavas de Final', leg: 'ida' },
  24: { kind: 'knockout', fase: 'Oitavas de Final', leg: 'volta' },
  27: { kind: 'knockout', fase: 'Quartas de Final', leg: 'ida' },
  28: { kind: 'knockout', fase: 'Quartas de Final', leg: 'volta' },
  31: { kind: 'knockout', fase: 'Semifinal', leg: 'ida' },
  32: { kind: 'knockout', fase: 'Semifinal', leg: 'volta' },
  37: { kind: 'knockout', fase: 'Final', leg: 'ida' },
};

function normalizeName(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
function toScore(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const score = Number(String(value).replace(',', '.'));
  return Number.isFinite(score) ? score.toFixed(2).replace('.', ',') : null;
}
function externalRows(ctx: AdapterContext): unknown[] { return (ctx.previous?.dados_externos?.rows ?? []) as unknown[]; }
function rowName(row: any): string { return String(Array.isArray(row) ? row[0] ?? '' : row?.nome ?? row?.team_name ?? row?.time ?? '').trim(); }
function rowId(row: any): string {
  const value = Array.isArray(row) ? row[1] : row?.id_cartola ?? row?.id;
  return value === null || value === undefined ? '' : String(value).trim();
}
function extractIds(ctx: AdapterContext): string[] { return [...new Set(externalRows(ctx).map(rowId).filter(Boolean))]; }
function buildIdByName(ctx: AdapterContext): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of externalRows(ctx)) {
    const name = normalizeName(rowName(row));
    const id = rowId(row);
    if (name && id && !map.has(name)) map.set(name, id);
  }
  return map;
}
function scoreForTeam(name: unknown, scores: Map<string, number | null>, idByName: Map<string, string>): string | null {
  const id = idByName.get(normalizeName(name));
  return id ? toScore(scores.get(id)) : null;
}

/** Atualiza exclusivamente a rodada-alvo; pontuações ausentes nunca apagam dados anteriores. */
export function updateLibertadoresFases(
  fases: ContinentalFases, targetRound: number | null,
  scores: Map<string, number | null>, idByName: Map<string, string>,
): ContinentalFases {
  const target = targetRound === null ? undefined : ROUND_TO_TARGET[targetRound];
  if (!target) return fases;

  if (target.kind === 'group') {
    const groupStage = fases['Fase de Grupos'];
    const roundKey = `rodada_${target.groupRound}`;
    const round = groupStage?.[roundKey];
    if (!round || !Array.isArray(round.groups)) return fases;
    const updatedRound = {
      ...round,
      groups: round.groups.map((group: any) => ({
        ...group,
        matches: Array.isArray(group.matches) ? group.matches.map((match: ContinentalMatch) => {
          const score1 = scoreForTeam(match.team1, scores, idByName);
          const score2 = scoreForTeam(match.team2, scores, idByName);
          return { ...match, ...(score1 !== null ? { score1 } : {}), ...(score2 !== null ? { score2 } : {}) };
        }) : group.matches,
      })),
    };
    return { ...fases, 'Fase de Grupos': { ...groupStage, [roundKey]: updatedRound } };
  }

  const phase = fases[target.fase];
  if (!phase || !Array.isArray(phase.matches)) return fases;
  const scoreKey1 = target.leg === 'ida' ? 'scoreIda1' : 'scoreVolta1';
  const scoreKey2 = target.leg === 'ida' ? 'scoreIda2' : 'scoreVolta2';
  return {
    ...fases,
    [target.fase]: {
      ...phase,
      matches: phase.matches.map((match: ContinentalMatch) => {
        const score1 = scoreForTeam(match.team1, scores, idByName);
        const score2 = scoreForTeam(match.team2, scores, idByName);
        return { ...match, ...(score1 !== null ? { [scoreKey1]: score1 } : {}), ...(score2 !== null ? { [scoreKey2]: score2 } : {}) };
      }),
    },
  };
}

export const cartolaLibertadoresAdapter: TournamentAdapter<LibertadoresRaw> = {
  id: 'cartola_brasileirao_libertadores_v1',
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

    if (ctx.scope.kind === 'fase') {
      const target = targetRound === null ? undefined : ROUND_TO_TARGET[targetRound];
      const targetPhase = target?.kind === 'group' ? 'Fase de Grupos' : target?.fase;
      if (!target || targetPhase !== ctx.scope.fase) {
        throw new Error(`Não é possível atualizar a fase "${ctx.scope.fase}" pela rodada ${targetRound ?? 'indisponível'}. Informe scope=rodada com a rodada de ida/volta desejada.`);
      }
    }

    const ids = extractIds(ctx);
    const teams = ids.length ? await fetchCartolaTeams(ids) : [];
    const target = targetRound === null ? undefined : ROUND_TO_TARGET[targetRound];
    const scores = target && targetRound !== null
      ? await fetchTeamsRoundScores(ids, targetRound)
      : new Map<string, number | null>();
    return {
      fases: updateLibertadoresFases((ctx.previous?.fases ?? {}) as ContinentalFases, targetRound, scores, buildIdByName(ctx)),
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
