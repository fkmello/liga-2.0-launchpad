import { isUnresolvedLibertadoresKnockoutTie } from './libertadoresKnockoutTie';

export interface ManualWinnerPayload {
  fases?: Record<string, { matches?: Array<Record<string, unknown>> }>;
}

/**
 * Validates and applies a manual knockout winner to a shadow-cache payload.
 * This helper is intentionally side-effect-free with respect to persistence:
 * callers decide when and where the returned payload is saved.
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
    !isUnresolvedLibertadoresKnockoutTie(target, phaseName)
  ) {
    throw new Error('O confronto mudou ou não está mais empatado. Atualize a tela e tente novamente.');
  }

  target.manualWinner = winner;
  return payload;
}
