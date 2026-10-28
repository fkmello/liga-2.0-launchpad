import { describe, expect, it } from 'vitest';
import { resolveLibertadoresProgression } from '../../supabase/functions/_shared/providers/cartola-brasileirao/adapter-libertadores';
import { mergeLibertadoresFasesPreservingScores } from '../../supabase/functions/_shared/cache/roundPreservation';

describe('preservação das escolhas manuais da Libertadores durante sincronização', () => {
  it('mantém vencedor e placar de pênaltis quando a API omite esses campos e usa o vencedor na próxima fase', () => {
    const previousMatches = Array.from({ length: 8 }, (_, index) => ({
      matchNumber: String(index + 1),
      team1: `Time A${index}`,
      team2: `Time B${index}`,
      scoreIda1: '80,00',
      scoreIda2: '70,00',
      scoreVolta1: index === 0 ? '70,00' : '75,00',
      scoreVolta2: '80,00',
      ...(index === 0
        ? {
            manualWinner: 'Time B0',
            manualPenaltyScore1: 3,
            manualPenaltyScore2: 5,
          }
        : {}),
    }));

    const nextApiMatches = previousMatches.map(match => ({
      matchNumber: match.matchNumber,
      team1: match.team1,
      team2: match.team2,
      scoreIda1: '',
      scoreIda2: '',
      scoreVolta1: '',
      scoreVolta2: '',
      // A API não devolve manualWinner nem os campos de pênaltis.
    }));

    const merged = mergeLibertadoresFasesPreservingScores(
      { 'Oitavas de Final': { matches: previousMatches } },
      {
        'Oitavas de Final': { matches: nextApiMatches },
        'Quartas de Final': {
          matches: Array.from({ length: 4 }, () => ({ team1: '', team2: '' })),
        },
      },
    ) as any;

    const preservedMatch = merged['Oitavas de Final'].matches[0];
    expect(preservedMatch.manualWinner).toBe('Time B0');
    expect(preservedMatch.manualPenaltyScore1).toBe(3);
    expect(preservedMatch.manualPenaltyScore2).toBe(5);
    expect(preservedMatch.scoreIda1).toBe('80,00');

    const progressed = resolveLibertadoresProgression(merged, { grupos: {} }) as any;
    expect(progressed['Quartas de Final'].matches[0].team1).toBe('Time B0');
    expect(progressed['Quartas de Final'].matches[0].team2).toBe('Time A1');

    // Os placares de pênaltis são somente visuais: alterá-los não muda a classificação.
    const alteredPenaltyScores = structuredClone(merged);
    alteredPenaltyScores['Oitavas de Final'].matches[0].manualPenaltyScore1 = 5;
    alteredPenaltyScores['Oitavas de Final'].matches[0].manualPenaltyScore2 = 2;
    const progressedWithAlteredPenalties = resolveLibertadoresProgression(
      alteredPenaltyScores,
      { grupos: {} },
    ) as any;
    expect(progressedWithAlteredPenalties['Quartas de Final'].matches[0].team1).toBe('Time B0');
    expect(progressedWithAlteredPenalties['Quartas de Final'].matches[0].team2).toBe('Time A1');
  });
});
