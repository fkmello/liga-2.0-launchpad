export interface KnockoutTieMatch {
  team1?: string | null;
  team2?: string | null;
  scoreIda1?: string | number | null;
  scoreIda2?: string | number | null;
  scoreVolta1?: string | number | null;
  scoreVolta2?: string | number | null;
  matchNumber?: string | null;
  manualWinner?: string | null;
}

const parseScore = (value: unknown): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

/** Detecta empate sem resolução manual em confrontos eliminatórios da Libertadores. */
export function isUnresolvedLibertadoresKnockoutTie(
  match: KnockoutTieMatch,
  phaseName: string,
): boolean {
  if (!match?.team1 || !match?.team2 || match.manualWinner) return false;

  const ida1 = parseScore(match.scoreIda1);
  const ida2 = parseScore(match.scoreIda2);
  if (ida1 === null || ida2 === null) return false;

  const volta1 = parseScore(match.scoreVolta1);
  const volta2 = parseScore(match.scoreVolta2);
  const matchNumber = String(match.matchNumber ?? '').toUpperCase();
  const singleMatch = phaseName === 'Final' &&
    (matchNumber === 'FINAL' || matchNumber.includes('LUGAR'));

  if (singleMatch && volta1 === null && volta2 === null) return ida1 === ida2;
  if (volta1 === null || volta2 === null) return false;
  return ida1 + volta1 === ida2 + volta2;
}
