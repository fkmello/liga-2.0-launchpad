import { describe, expect, it } from 'vitest';
import { resolveSulamericanaProgression } from '../../supabase/functions/_shared/providers/cartola-brasileirao/adapter-sulamericana';

function standing(team: string, points: number, wins: number, goalDiff: number, goalsFor: number) {
  return ['', '', team, String(points), '6', String(wins), '0', '0', String(goalsFor), String(goalDiff)];
}

function completeGroupFases() {
  const groups = Array.from({ length: 7 }, (_, index) => ({
    name: `GRUPO ${String.fromCharCode(65 + index)}`,
    matches: [{ team1: `Time ${index} A`, team2: `Time ${index} B`, score1: '80,00', score2: '70,00' }],
  }));
  const fases: any = { 'Fase de Grupos': {} };
  for (let round = 1; round <= 6; round++) {
    fases['Fase de Grupos'][`rodada_${round}`] = { groups };
  }
  fases['Oitavas de Final'] = { matches: Array.from({ length: 8 }, (_, i) => ({ matchNumber: String(i + 1), team1: '', team2: '' })) };
  fases['Quartas de Final'] = { matches: Array.from({ length: 4 }, () => ({ team1: '', team2: '' })) };
  fases.Semifinal = { matches: Array.from({ length: 2 }, () => ({ team1: '', team2: '' })) };
  fases.Final = { matches: [
    { matchNumber: 'FINAL', team1: '', team2: '' },
    { matchNumber: '3º LUGAR', team1: '', team2: '' },
  ] };
  return fases;
}

describe('Sul-Americana progression', () => {
  it('seeds round of 16 from 14 group qualifiers and the two Libertadores best thirds', () => {
    const grupos: Record<string, unknown[]> = {};
    for (let i = 0; i < 7; i++) {
      const group = `GRUPO ${String.fromCharCode(65 + i)}`;
      grupos[group] = [
        standing(`Primeiro ${i}`, 40 - i, 6, 20 - i, 100 - i),
        standing(`Segundo ${i}`, 25 - i, 4, 8 - i, 70 - i),
        standing(`Terceiro ${i}`, 10 - i, 2, 1 - i, 40 - i),
        standing(`Quarto ${i}`, 0, 0, -20, 10),
      ];
    }
    const fases = completeGroupFases();
    const result = resolveSulamericanaProgression(fases, { grupos }, [
      { team: 'Libertadores Third 1', points: 15, wins: 3, goalDiff: 5, goalsFor: 50 },
      { team: 'Libertadores Third 2', points: 14, wins: 3, goalDiff: 4, goalsFor: 49 },
    ]);
    expect(result['Oitavas de Final'].matches).toHaveLength(8);
    expect(result['Oitavas de Final'].matches[0].team1).toBe('Primeiro 0');
    expect(result['Oitavas de Final'].matches[0].team2).toBe('Libertadores Third 2');
    expect(result['Oitavas de Final'].matches[7].team1).toBe('Segundo 0');
    expect(result['Oitavas de Final'].matches[7].team2).toBe('Segundo 1');
  });

  it('advances winners from matches 1 and 2 into the first quarter-final', () => {
    const fases: any = {
      'Oitavas de Final': { matches: Array.from({ length: 8 }, (_, i) => ({
        team1: 'Oitavas A' + i, team2: 'Oitavas B' + i,
        scoreIda1: i < 2 ? '90,00' : '', scoreIda2: i < 2 ? '70,00' : '',
        scoreVolta1: i < 2 ? '80,00' : '', scoreVolta2: i < 2 ? '75,00' : '',
      })) },
      'Quartas de Final': { matches: Array.from({ length: 4 }, () => ({ team1: '', team2: '' })) },
      Semifinal: { matches: Array.from({ length: 2 }, () => ({ team1: '', team2: '' })) },
      Final: { matches: [{ matchNumber: 'FINAL', team1: '', team2: '' }, { matchNumber: '3º LUGAR', team1: '', team2: '' }] },
    };
    const result = resolveSulamericanaProgression(fases, { grupos: {} }, []);
    expect(result['Quartas de Final'].matches[0].team1).toBe('Oitavas A0');
    expect(result['Quartas de Final'].matches[0].team2).toBe('Oitavas A1');
  });

  it('does not seed the bracket if the two Libertadores third-place qualifiers are unavailable', () => {
    const grupos: Record<string, unknown[]> = {};
    for (let i = 0; i < 7; i++) {
      const group = `GRUPO ${String.fromCharCode(65 + i)}`;
      grupos[group] = [
        standing(`Primeiro ${i}`, 40 - i, 6, 20 - i, 100 - i),
        standing(`Segundo ${i}`, 25 - i, 4, 8 - i, 70 - i),
        standing(`Terceiro ${i}`, 10 - i, 2, 1 - i, 40 - i),
        standing(`Quarto ${i}`, 0, 0, -20, 10),
      ];
    }
    const fases = completeGroupFases();
    const result = resolveSulamericanaProgression(fases, { grupos }, []);
    expect(result['Oitavas de Final'].matches.every((match: any) => !match.team1 && !match.team2)).toBe(true);
  });
});
