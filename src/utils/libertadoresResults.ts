export interface LibertadoresFinalMatch {
  team1?: string;
  team2?: string;
  scoreIda1?: string | number | null;
  scoreIda2?: string | number | null;
  scoreVolta1?: string | number | null;
  scoreVolta2?: string | number | null;
  manualWinner?: string;
}

export interface LibertadoresMatchResult {
  winner: string;
  loser: string;
}

/** Final and third-place fixtures are single Cartola rounds; accept a second leg only if both scores exist. */
export function resolveLibertadoresFinalResult(
  match: LibertadoresFinalMatch | null | undefined,
): LibertadoresMatchResult | null {
  if (!match?.team1 || !match?.team2) return null;
  const parse = (value: unknown): number | null => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const score1 = parse(match.scoreIda1);
  const score2 = parse(match.scoreIda2);
  if (score1 === null || score2 === null) return null;
  const volta1 = parse(match.scoreVolta1);
  const volta2 = parse(match.scoreVolta2);
  const hasSecondLeg = volta1 !== null && volta2 !== null;
  const total1 = score1 + (hasSecondLeg ? volta1 : 0);
  const total2 = score2 + (hasSecondLeg ? volta2 : 0);
  if (total1 === total2) {
    if (match.manualWinner === match.team1) return { winner: match.team1, loser: match.team2 };
    if (match.manualWinner === match.team2) return { winner: match.team2, loser: match.team1 };
    return null;
  }
  return total1 > total2
    ? { winner: match.team1, loser: match.team2 }
    : { winner: match.team2, loser: match.team1 };
}
