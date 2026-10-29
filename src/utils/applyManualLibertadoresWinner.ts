import { isUnresolvedLibertadoresKnockoutTie } from './libertadoresKnockoutTie';

export interface ManualWinnerPayload {
  fases?: Record<string, { matches?: Array<Record<string, unknown>> }>;
}

const createVisualPenaltyScore = (winner: string, team1: unknown, team2: unknown) => {
  const winnerScore = Math.random() < 0.5 ? 4 : 5;
  const loserScore = 2 + Math.floor(Math.random() * (winnerScore - 2));
  return winner === team1
    ? { manualPenaltyScore1: winnerScore, manualPenaltyScore2: loserScore }
    : { manualPenaltyScore1: loserScore, manualPenaltyScore2: winnerScore };
};

/**
 * Validates and applies a manual knockout winner to a shadow-cache payload.
 * Penalty scores are visual-only metadata: they never change match scores,
 * aggregate totals, standings, or qualification calculations.
 */
export function applyManualLibertadoresWinner(
  payload: ManualWinnerPayload,
  phaseName: string,
  matchNumber: string,
  winner: string,
): ManualWinnerPayload {
  const matches = payload?.fases?.[phaseName]?.matches;
  if (!Array.isArray(matches)) {
    throw new Error(`A fase ${phaseName} não foi encontrada no cache.`);
  }

  const normalizedNumber = matchNumber.trim().toUpperCase();
  const target = matches.find(match =>
    String(match?.matchNumber ?? '').trim().toUpperCase() === normalizedNumber,
  );

  if (
    !target ||
    ![target.team1, target.team2].includes(winner) ||
    !isUnresolvedLibertadoresKnockoutTie(target as any, phaseName)
  ) {
    throw new Error('O confronto mudou ou não está mais empatado. Atualize a tela e tente novamente.');
  }

  target.manualWinner = winner;
  Object.assign(target, createVisualPenaltyScore(winner, target.team1, target.team2));
  return payload;
}
