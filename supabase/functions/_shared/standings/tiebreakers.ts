import type { Comparator, MatchInput, StandingRow, StandingsContext, TiebreakerId } from './types.ts';

const desc = (a: number | string, b: number | string) => {
  const na = typeof a === 'string' ? Number(a.replace(',', '.')) : a;
  const nb = typeof b === 'string' ? Number(b.replace(',', '.')) : b;
  // Arredonda para 2 casas decimais para evitar flutuações de ponto flutuante (ex: 0.000000001)
  return Math.round(nb * 100) / 100 - Math.round(na * 100) / 100;
};
const asc = (a: number | string, b: number | string) => {
  const na = typeof a === 'string' ? Number(a.replace(',', '.')) : a;
  const nb = typeof b === 'string' ? Number(b.replace(',', '.')) : b;
  return Math.round(na * 100) / 100 - Math.round(nb * 100) / 100;
};

export function isPlayed(m: MatchInput): boolean {
  return m.homeGoals !== null && m.awayGoals !== null;
}

function headToHead(a: StandingRow, b: StandingRow, ctx: StandingsContext): number {
  const { pointsWin, pointsDraw } = ctx.options;
  let ptsA = 0;
  let ptsB = 0;
  let gdA = 0;
  for (const m of ctx.matches) {
    if (!isPlayed(m)) continue;
    const involves =
      (m.homeId === a.teamId && m.awayId === b.teamId) ||
      (m.homeId === b.teamId && m.awayId === a.teamId);
    if (!involves) continue;
    const aIsHome = m.homeId === a.teamId;
    const ga = (aIsHome ? m.homeGoals : m.awayGoals) as number;
    const gb = (aIsHome ? m.awayGoals : m.homeGoals) as number;
    gdA += ga - gb;
    if (ga > gb) ptsA += pointsWin;
    else if (ga < gb) ptsB += pointsWin;
    else {
      ptsA += pointsDraw;
      ptsB += pointsDraw;
    }
  }
  if (ptsA !== ptsB) return desc(ptsA, ptsB);
  if (gdA !== 0) return gdA > 0 ? -1 : 1;
  return 0;
}

export const TIEBREAKERS: Record<TiebreakerId, Comparator> = {
  points: (a, b) => desc(a.points, b.points),
  wins: (a, b) => desc(a.wins, b.wins),
  goalDiff: (a, b) => desc(a.goalDiff, b.goalDiff),
  goalsFor: (a, b) => desc(a.goalsFor, b.goalsFor),
  goalsAgainst: (a, b) => asc(a.goalsAgainst, b.goalsAgainst),
  disciplinary: (a, b) => asc(a.disciplinary, b.disciplinary),
  headToHead,
};
