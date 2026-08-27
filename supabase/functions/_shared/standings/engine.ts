import { TIEBREAKERS, isPlayed } from './tiebreakers.ts';
import type {
  MatchInput,
  StandingRow,
  StandingsContext,
  StandingsOptions,
} from './types.ts';

/**
 * Engine 100% genérica: recebe apenas `matches` + `options` e devolve a
 * classificação. Não conhece nenhum torneio, liga, provider ou temporada.
 */
export function calculateStandings(
  matches: MatchInput[],
  options: StandingsOptions,
): Record<string, StandingRow[]> {
  const ctx: StandingsContext = {
    matches,
    options: {
      pointsWin: options.pointsWin ?? 3,
      pointsDraw: options.pointsDraw ?? 1,
      pointsLoss: options.pointsLoss ?? 0,
      ...options,
    },
  };
  const { pointsWin, pointsDraw, pointsLoss } = ctx.options;

  const buckets = new Map<string, Map<string, StandingRow>>();

  const rowFor = (groupKey: string, id: string, name?: string): StandingRow => {
    let bucket = buckets.get(groupKey);
    if (!bucket) {
      bucket = new Map();
      buckets.set(groupKey, bucket);
    }
    let row = bucket.get(id);
    if (!row) {
      row = {
        teamId: id,
        teamName: name ?? id,
        group: options.groupBy ? groupKey : undefined,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        points: 0,
        disciplinary: 0,
        position: 0,
      };
      bucket.set(id, row);
    } else if (name && row.teamName === row.teamId) {
      row.teamName = name;
    }
    return row;
  };

  for (const m of matches) {
    const groupKey = options.groupBy ? (m.group ?? '') : '';
    const home = rowFor(groupKey, m.homeId, m.homeName);
    const away = rowFor(groupKey, m.awayId, m.awayName);
    home.disciplinary += m.homeDisciplinary ?? 0;
    away.disciplinary += m.awayDisciplinary ?? 0;
    if (!isPlayed(m)) continue;

    const hg = m.homeGoals as number;
    const ag = m.awayGoals as number;
    home.played += 1;
    away.played += 1;
    home.goalsFor += hg;
    home.goalsAgainst += ag;
    away.goalsFor += ag;
    away.goalsAgainst += hg;

    if (hg > ag) {
      home.wins += 1;
      away.losses += 1;
      home.points += pointsWin;
      away.points += pointsLoss;
    } else if (hg < ag) {
      away.wins += 1;
      home.losses += 1;
      away.points += pointsWin;
      home.points += pointsLoss;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += pointsDraw;
      away.points += pointsDraw;
    }
  }

  const comparators = ctx.options.tiebreakers.map((id) => {
    const c = TIEBREAKERS[id];
    if (!c) throw new Error(`Critério de desempate desconhecido: ${id}`);
    return c;
  });

  const result: Record<string, StandingRow[]> = {};
  for (const [groupKey, bucket] of buckets) {
    const rows = [...bucket.values()];
    for (const r of rows) {
      r.goalsFor = Math.round(r.goalsFor * 100) / 100;
      r.goalsAgainst = Math.round(r.goalsAgainst * 100) / 100;
      r.goalDiff = Math.round((r.goalsFor - r.goalsAgainst) * 100) / 100;
    }
    rows.sort((a, b) => {
      for (const cmp of comparators) {
        const v = cmp(a, b, ctx);
        if (v !== 0) return v;
      }
      return a.teamName.localeCompare(b.teamName);
    });
    rows.forEach((r, i) => {
      r.position = i + 1;
    });
    result[groupKey] = rows;
  }
  return result;
}
