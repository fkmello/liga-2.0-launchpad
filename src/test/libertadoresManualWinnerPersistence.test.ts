import { describe, expect, it } from 'vitest';
import { resolveLibertadoresProgression } from '../../supabase/functions/_shared/providers/cartola-brasileirao/adapter-libertadores';
import { mergeLibertadoresFasesPreservingScores } from '../../supabase/functions/_shared/cache/roundPreservation';

describe('preservação do vencedor manual da Libertadores durante sincronização', () => {
  it('mantém a escolha quando a API omite o campo e usa o vencedor na próxima fase', () => {
    const previousMatches = Array.from({ length: 8 }, (_, index) => ({
      matchNumber: String(index + 1),
      team1: `Time A${index}`,
      team2: `Time B${index}`,
      scoreIda1: '80,00',
      scoreIda2: index === 0 ? '70,00' : '70,00',
      scoreVolta1: index === 0 ? '70,00' : '75,00',
      scoreVolta2: '80,00',
      ...(index === 0 ? { manualWinner: 'Time B0' } : {}),
    }));

    const nextApiMatches = previousMatches.map(match => ({
      matchNumber: match.matchNumber,
      team1: match.team1,
      team2: match.team2,
      scoreIda1: '',
      scoreIda2: '',
      scoreVolta1: '',
      scoreVolta2: '',
      // A API não devolve manualWinner.
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

    expect(merged['Oitavas de Final'].matches[0].manualWinner).toBe('Time B0');
    expect(merged['Oitavas de Final'].matches[0].scoreIda1).toBe('80,00');

    const progressed = resolveLibertadoresProgression(merged, { grupos: {} }) as any;
    expect(progressed['Quartas de Final'].matches[0].team1).toBe('Time B0');
    expect(progressed['Quartas de Final'].matches[0].team2).toBe('Time A1');
  });
});
