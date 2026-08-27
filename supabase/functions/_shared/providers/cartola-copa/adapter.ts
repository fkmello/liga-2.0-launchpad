import type { AdapterContext, TournamentAdapter } from '../../tournament/types.ts';
import type { MatchInput } from '../../standings/types.ts';
import { KnownProviders } from '../../sync/providers.ts';
import { fetchCopaTeams, type CopaTeamRaw } from './api-client.ts';

interface CopaRaw {
  teams: CopaTeamRaw[];
  matches: MatchInput[];
}

function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

/** IDs vêm do próprio cache (coluna id_cartola de dados_externos). */
function extractIds(ctx: AdapterContext): string[] {
  const rows = (ctx.previous?.dados_externos?.rows ?? []) as any[];
  const ids = new Set<string>();
  for (const row of rows) {
    const id = Array.isArray(row) ? row[1] : row?.id_cartola ?? row?.id;
    if (id) ids.add(String(id).trim());
  }
  return [...ids].filter(Boolean);
}

/** Confrontos já normalizados a partir do cache atual (fase de grupos). */
function extractMatches(ctx: AdapterContext): MatchInput[] {
  const grupos = (ctx.previous?.fases as any)?.fase_grupos ?? {};
  const out: MatchInput[] = [];
  for (const [rodadaKey, rodada] of Object.entries<any>(grupos)) {
    for (const m of rodada?.matches ?? rodada?.confrontos ?? []) {
      const home = m.team1 ?? m.home ?? m.mandante;
      const away = m.team2 ?? m.away ?? m.visitante;
      if (!home || !away) continue;
      out.push({
        group: m.grupo ?? m.group ?? '',
        round: rodadaKey,
        homeId: String(m.id1 ?? home),
        awayId: String(m.id2 ?? away),
        homeName: String(home),
        awayName: String(away),
        homeGoals: toNum(m.score1 ?? m.gols1 ?? m.homeGoals),
        awayGoals: toNum(m.score2 ?? m.gols2 ?? m.awayGoals),
      });
    }
  }
  return out;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export const cartolaCopaAdapter: TournamentAdapter<CopaRaw> = {
  id: 'cartola_copa_v1',
  provider: KnownProviders.CARTOLA_COPA,
  source_type: 'api',

  async fetchRaw(ctx) {
    const ids = extractIds(ctx);
    const teams = ids.length ? await fetchCopaTeams(ids) : [];
    return { teams, matches: extractMatches(ctx) };
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
      const id = String(row[1] ?? '').trim();
      const name = normalizeName(String(row[0] ?? ''));
      const team = byId.get(id) ?? byName.get(name);
      if (!team?.escudo) return row;
      const next = [...row];
      next[2] = team.escudo;
      return next;
    });
    return { rows };
  },

  toMatches(raw) {
    return raw.matches;
  },
};
