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

interface MataMataRaw {
  fases: CupFases;
  teams: CartolaTeamRaw[];
}

type Leg = 'ida' | 'volta';

const ROUND_TO_PHASE_LEG: Record<number, { fase: string; leg: Leg }> = {
  23: { fase: 'Oitavas de Final', leg: 'ida' },
  24: { fase: 'Oitavas de Final', leg: 'volta' },
  27: { fase: 'Quartas de Final', leg: 'ida' },
  28: { fase: 'Quartas de Final', leg: 'volta' },
  31: { fase: 'Semifinal', leg: 'ida' },
  32: { fase: 'Semifinal', leg: 'volta' },
  // A final é jogo único; a estrutura legada guarda esse placar nos campos "Ida".
  37: { fase: 'Final', leg: 'ida' },
};

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

function updateFases(
  fases: CupFases,
  targetRound: number | null,
  scores: Map<string, number | null>,
  idByName: Map<string, string>,
  onlyPhase?: string,
): CupFases {
  const target = targetRound === null ? undefined : ROUND_TO_PHASE_LEG[targetRound];
  if (!target || (onlyPhase && onlyPhase !== target.fase)) return fases;

  const fase = fases[target.fase];
  if (!fase || !Array.isArray(fase.matches)) return fases;

  const scoreKey1 = target.leg === 'ida' ? 'scoreIda1' : 'scoreVolta1';
  const scoreKey2 = target.leg === 'ida' ? 'scoreIda2' : 'scoreVolta2';

  return {
    ...fases,
    [target.fase]: {
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
    },
  };
}

/** Adapter isolado para Libertadores e Sul-Americana; escreve apenas via shadow repository. */
export function createCartolaMataMataAdapter(
  league: 'libertadores' | 'sulamericana',
): TournamentAdapter<MataMataRaw> {
  return {
    id: league === 'libertadores'
      ? 'cartola_libertadores_v1'
      : 'cartola_sulamericana_v1',
    provider: KnownProviders.CARTOLA_BRASILEIRAO,
    source_type: 'api',

    async fetchRaw(ctx) {
      const fases = (ctx.previous?.fases ?? {}) as CupFases;
      const ids = extractIds(ctx);
      const teams = ids.length ? await fetchCartolaTeams(ids) : [];

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

      if (ctx.scope.kind === 'fase') {
        const mapped = targetRound === null ? undefined : ROUND_TO_PHASE_LEG[targetRound];
        if (!mapped || mapped.fase !== ctx.scope.fase) {
          throw new Error(
            `Não é possível atualizar a fase "${ctx.scope.fase}" pela rodada ${targetRound ?? 'indisponível'}. Informe scope=rodada com a rodada de ida/volta desejada.`,
          );
        }
      }

      const mapped = targetRound === null ? undefined : ROUND_TO_PHASE_LEG[targetRound];
      const scores = mapped && ids.length && targetRound !== null
        ? await fetchTeamsRoundScores(ids, targetRound)
        : new Map<string, number | null>();

      const updatedFases = updateFases(
        fases,
        targetRound,
        scores,
        buildIdByName(ctx),
        ctx.scope.kind === 'fase' ? ctx.scope.fase : undefined,
      );

      return { fases: updatedFases, teams };
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

    toMatches() {
      return [];
    },
  };
}
