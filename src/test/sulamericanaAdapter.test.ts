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
        scoreIda1: '90,00', scoreIda2: '70,00',
        scoreVolta1: '80,00', scoreVolta2: '75,00',
      })) },
      'Quartas de Final': { matches: Array.from({ length: 4 }, () => ({ team1: '', team2: '' })) },
      Semifinal: { matches: Array.from({ length: 2 }, () => ({ team1: '', team2: '' })) },
      Final: { matches: [{ matchNumber: 'FINAL', team1: '', team2: '' }, { matchNumber: '3º LUGAR', team1: '', team2: '' }] },
    };
    const result = resolveSulamericanaProgression(fases, { grupos: {} }, []);
    expect(result['Quartas de Final'].matches[0].team1).toBe('Oitavas A0');
    expect(result['Quartas de Final'].matches[0].team2).toBe('Oitavas A1');
  });

  it('honors a manually selected winner even when a score field is missing', () => {
    const fases: any = {
      'Oitavas de Final': { matches: Array.from({ length: 8 }, (_, i) => ({
        team1: 'Oitavas A' + i, team2: 'Oitavas B' + i,
        scoreIda1: i === 0 ? '' : '90,00',
        scoreIda2: i === 0 ? '' : '70,00',
        scoreVolta1: i === 0 ? '' : '80,00',
        scoreVolta2: i === 0 ? '' : '75,00',
        ...(i === 0 ? { manualWinner: 'Oitavas B0' } : {}),
      })) },
      'Quartas de Final': { matches: Array.from({ length: 4 }, () => ({ team1: '', team2: '' })) },
      Semifinal: { matches: Array.from({ length: 2 }, () => ({ team1: '', team2: '' })) },
      Final: { matches: [{ matchNumber: 'FINAL', team1: '', team2: '' }, { matchNumber: '3º LUGAR', team1: '', team2: '' }] },
    };
    const result = resolveSulamericanaProgression(fases, { grupos: {} }, []);
    expect(result['Quartas de Final'].matches[0].team1).toBe('Oitavas B0');
    expect(result['Quartas de Final'].matches[0].team2).toBe('Oitavas A1');
  });

  it('waits for every round-of-16 confrontation before advancing any team', () => {
    const fases: any = {
      'Oitavas de Final': { matches: Array.from({ length: 8 }, (_, i) => ({
        team1: 'Oitavas A' + i, team2: 'Oitavas B' + i,
        scoreIda1: i < 7 ? '90,00' : '', scoreIda2: i < 7 ? '70,00' : '',
        scoreVolta1: i < 7 ? '80,00' : '', scoreVolta2: i < 7 ? '75,00' : '',
      })) },
      'Quartas de Final': { matches: Array.from({ length: 4 }, (_, i) => ({
        team1: 'Quartas A' + i, team2: 'Quartas B' + i,
        scoreIda1: '90,00', scoreIda2: '70,00',
        scoreVolta1: '80,00', scoreVolta2: '75,00',
      })) },
      Semifinal: { matches: Array.from({ length: 2 }, () => ({ team1: '', team2: '' })) },
      Final: { matches: [{ matchNumber: 'FINAL', team1: '', team2: '' }, { matchNumber: '3º LUGAR', team1: '', team2: '' }] },
    };
    const result = resolveSulamericanaProgression(fases, { grupos: {} }, []);
    expect(result['Quartas de Final'].matches.every((match: any) => !match.team1 && !match.team2)).toBe(true);
    expect(result.Semifinal.matches.every((match: any) => !match.team1 && !match.team2)).toBe(true);
    expect(result.Final.matches.every((match: any) => !match.team1 && !match.team2)).toBe(true);
  });

  it('does not skip missing round-of-16 data to advance stale quarter-final results', () => {
    const fases: any = {
      'Quartas de Final': { matches: Array.from({ length: 4 }, (_, i) => ({
        team1: `Quartas A${i}`, team2: `Quartas B${i}`,
        scoreIda1: '90,00', scoreIda2: '70,00',
        scoreVolta1: '80,00', scoreVolta2: '75,00',
      })) },
      Semifinal: { matches: Array.from({ length: 2 }, () => ({ team1: 'Semis stale A', team2: 'Semis stale B' })) },
      Final: { matches: [
        { matchNumber: 'FINAL', team1: 'Finalista A', team2: 'Finalista B' },
        { matchNumber: '3º LUGAR', team1: 'Terceiro A', team2: 'Terceiro B' },
      ] },
    };
    const result = resolveSulamericanaProgression(fases, { grupos: {} }, []);
    expect(result['Quartas de Final'].matches.every((match: any) => !match.team1 && !match.team2)).toBe(true);
    expect(result.Semifinal.matches.every((match: any) => !match.team1 && !match.team2)).toBe(true);
    expect(result.Final.matches.every((match: any) => !match.team1 && !match.team2)).toBe(true);
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

  it('advances to semifinals only after all four quarter-final winners are resolved', () => {
    const quarterfinals = Array.from({ length: 4 }, (_, i) => ({
      team1: `QF A${i}`, team2: `QF B${i}`,
      scoreIda1: '2', scoreIda2: '0', scoreVolta1: '1', scoreVolta2: '0',
    }));
    const fases: any = {
      'Oitavas de Final': { matches: Array.from({ length: 8 }, (_, i) => {
        const winners = ['QF A0', 'QF B0', 'QF A1', 'QF B1', 'QF A2', 'QF B2', 'QF A3', 'QF B3'];
        return {
          team1: winners[i], team2: `R16 B${i}`,
          scoreIda1: '2', scoreIda2: '0', scoreVolta1: '1', scoreVolta2: '0',
        };
      }) },
      'Quartas de Final': { matches: quarterfinals },
      Semifinal: { matches: Array.from({ length: 2 }, () => ({ team1: '', team2: '' })) },
      Final: { matches: [
        { matchNumber: 'FINAL', team1: '', team2: '' },
        { matchNumber: '3º LUGAR', team1: '', team2: '' },
      ] },
    };
    const result = resolveSulamericanaProgression(fases, { grupos: {} }, []);
    expect(result.Semifinal.matches.map((match: any) => [match.team1, match.team2])).toEqual([
      ['QF A0', 'QF A1'],
      ['QF A2', 'QF A3'],
    ]);

    const incomplete = {
      ...fases,
      'Quartas de Final': { matches: quarterfinals.map((match, i) =>
        i === 3 ? { ...match, scoreVolta1: '', scoreVolta2: '' } : match
      ) },
      Semifinal: { matches: [{ team1: 'Old SF A', team2: 'Old SF B' }, { team1: 'Old SF C', team2: 'Old SF D' }] },
      Final: { matches: [{ matchNumber: 'FINAL', team1: 'Old Final A', team2: 'Old Final B' }, { matchNumber: '3º LUGAR', team1: 'Old 3rd A', team2: 'Old 3rd B' }] },
    };
    const blocked = resolveSulamericanaProgression(incomplete as any, { grupos: {} }, []);
    expect(blocked.Semifinal.matches.every((match: any) => !match.team1 && !match.team2)).toBe(true);
    expect(blocked.Final.matches.every((match: any) => !match.team1 && !match.team2)).toBe(true);
  });

  it('fills the final and third-place match only after both semifinal winners are resolved', () => {
    const fases: any = {
      'Oitavas de Final': { matches: Array.from({ length: 8 }, (_, i) => {
        const winners = ['Semi A', 'Semi B', 'Semi C', 'Semi D', 'QF A2', 'QF B2', 'QF A3', 'QF B3'];
        return {
          team1: winners[i], team2: `R16 B${i}`,
          scoreIda1: '2', scoreIda2: '0', scoreVolta1: '1', scoreVolta2: '0',
        };
      }) },
      'Quartas de Final': { matches: Array.from({ length: 4 }, (_, i) => ({
        team1: ['Semi A', 'Semi C', 'QF A2', 'QF A3'][i],
        team2: ['Semi B', 'Semi D', 'QF B2', 'QF B3'][i],
        scoreIda1: '2', scoreIda2: '0', scoreVolta1: '1', scoreVolta2: '0',
      })) },
      Semifinal: { matches: [
        { team1: 'Semi A', team2: 'Semi B', scoreIda1: '2', scoreIda2: '0', scoreVolta1: '1', scoreVolta2: '0' },
        { team1: 'Semi C', team2: 'Semi D', scoreIda1: '0', scoreIda2: '1', scoreVolta1: '0', scoreVolta2: '1' },
      ] },
      Final: { matches: [
        { matchNumber: 'FINAL', team1: '', team2: '' },
        { matchNumber: '3º LUGAR', team1: '', team2: '' },
      ] },
    };
    const result = resolveSulamericanaProgression(fases, { grupos: {} }, []);
    expect([result.Final.matches[0].team1, result.Final.matches[0].team2]).toEqual(['Semi A', 'Semi D']);
    expect([result.Final.matches[1].team1, result.Final.matches[1].team2]).toEqual(['Semi B', 'Semi C']);
  });

  it('clears stale final and third-place pairings when a semifinal is incomplete or tied', () => {
    const fases: any = {
      'Oitavas de Final': { matches: Array.from({ length: 8 }, (_, i) => ({
        team1: `R16 A${i}`, team2: `R16 B${i}`,
        scoreIda1: '2', scoreIda2: '0', scoreVolta1: '1', scoreVolta2: '0',
      })) },
      'Quartas de Final': { matches: Array.from({ length: 4 }, (_, i) => ({
        team1: `QF A${i}`, team2: `QF B${i}`,
        scoreIda1: '2', scoreIda2: '0', scoreVolta1: '1', scoreVolta2: '0',
      })) },
      Semifinal: { matches: [
        { team1: 'Semi A', team2: 'Semi B', scoreIda1: '2', scoreIda2: '0', scoreVolta1: '1', scoreVolta2: '0' },
        { team1: 'Semi C', team2: 'Semi D', scoreIda1: '1', scoreIda2: '0', scoreVolta1: '0', scoreVolta2: '1' },
      ] },
      Final: { matches: [
        { matchNumber: 'FINAL', team1: 'Old Final A', team2: 'Old Final B', scoreIda1: '3', scoreIda2: '2' },
        { matchNumber: '3º LUGAR', team1: 'Old 3rd A', team2: 'Old 3rd B', scoreIda1: '1', scoreIda2: '0' },
      ] },
    };
    const result = resolveSulamericanaProgression(fases, { grupos: {} }, []);
    expect(result.Final.matches.every((match: any) => !match.team1 && !match.team2)).toBe(true);
    expect(result.Final.matches.every((match: any) => !match.scoreIda1 && !match.scoreIda2 && !match.scoreVolta1 && !match.scoreVolta2)).toBe(true);
  });

});
