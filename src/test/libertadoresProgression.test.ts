import { describe, expect, it } from 'vitest';
import { resolveLibertadoresProgression } from '../../supabase/functions/_shared/providers/cartola-brasileirao/libertadores-progression';

const played = (team1: string, team2: string, n = 1) => ({
  team1, team2,
  scoreIda1: String(80 + n), scoreIda2: '70',
  scoreVolta1: String(75 + n), scoreVolta2: '72',
});
const phase = (count: number, prefix: string) => ({
  matches: Array.from({ length: count }, (_, i) => played(`${prefix} ${i + 1}A`, `${prefix} ${i + 1}B`, i + 1)),
});
const classification = { grupos: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [
  `GRUPO ${String.fromCharCode(65 + i)}`,
  [
    [ '1', '', `Classificado ${i * 2 + 1}`, String(30 - i), '6', '5', '0', '1', String(500 - i), String(100 - i) ],
    [ '2', '', `Classificado ${i * 2 + 2}`, String(20 - i), '6', '4', '0', '2', String(400 - i), String(50 - i) ],
    [ '3', '', `Terceiro ${i + 1}`, '10', '6', '2', '0', '4', '300', '0' ],
    [ '4', '', `Quarto ${i + 1}`, '1', '6', '0', '0', '6', '200', '-100' ],
  ],
])) };

function completeGroups() {
  return { 'Fase de Grupos': Object.fromEntries(Array.from({ length: 6 }, (_, i) => [
    `rodada_${i + 1}`,
    { groups: Array.from({ length: 8 }, (_, g) => ({
      name: `GRUPO ${String.fromCharCode(65 + g)}`,
      matches: [{ team1: 'A', team2: 'B', score1: '80,00', score2: '70,00' }],
    })) },
  ])) };
}

describe('Libertadores full bracket progression', () => {
  it('seeds the top 16 teams and pairs 1v16 through 8v9 only after every group match has scores', () => {
    const fases = {
      ...completeGroups(),
      'Oitavas de Final': { matches: Array.from({ length: 8 }, (_, i) => ({ matchNumber: String(i + 1), team1: '', team2: '' })) },
    };
    const result = resolveLibertadoresProgression(fases, classification);
    expect(result['Oitavas de Final'].matches[0].team1).toBe('Classificado 1');
    expect(result['Oitavas de Final'].matches[0].team2).toBe('Classificado 16');
    expect(result['Oitavas de Final'].matches[7].team1).toBe('Classificado 8');
    expect(result['Oitavas de Final'].matches[7].team2).toBe('Classificado 9');
    const incomplete = { ...fases, 'Fase de Grupos': { ...fases['Fase de Grupos'], rodada_6: { groups: [] } } };
    expect(resolveLibertadoresProgression(incomplete, classification)['Oitavas de Final'].matches[0].team1).toBe('');
  });

  it('advances winners through quarters and semifinals and sets finalists plus third-place teams', () => {
    const fases = {
      'Oitavas de Final': phase(8, 'Oitavas'),
      'Quartas de Final': phase(4, 'Quartas'),
      Semifinal: phase(2, 'Semi'),
      Final: { matches: [
        { matchNumber: 'FINAL', team1: '', team2: '', scoreIda1: '', scoreIda2: '', scoreVolta1: '', scoreVolta2: '' },
        { matchNumber: '3º LUGAR', team1: '', team2: '', scoreIda1: '', scoreIda2: '', scoreVolta1: '', scoreVolta2: '' },
      ] },
    };
    const result = resolveLibertadoresProgression(fases, { grupos: {} });
    expect(result['Quartas de Final'].matches.map((m: any) => m.team1)).toEqual(['Oitavas 1A', 'Oitavas 3A', 'Oitavas 5A', 'Oitavas 7A']);
    expect(result.Semifinal.matches.map((m: any) => m.team1)).toEqual(['Quartas 1A', 'Quartas 3A']);
    expect(result.Final.matches[0].team1).toBe('Semi 1A');
    expect(result.Final.matches[0].team2).toBe('Semi 2A');
    expect(result.Final.matches[1].team1).toBe('Semi 1B');
    expect(result.Final.matches[1].team2).toBe('Semi 2B');
  });

  it('does not invent a group-stage seed when second and third are tied on all criteria', () => {
    const tied = JSON.parse(JSON.stringify(classification));
    tied.grupos['GRUPO A'][2][3] = tied.grupos['GRUPO A'][1][3];
    tied.grupos['GRUPO A'][2][5] = tied.grupos['GRUPO A'][1][5];
    tied.grupos['GRUPO A'][2][9] = tied.grupos['GRUPO A'][1][9];
    tied.grupos['GRUPO A'][2][8] = tied.grupos['GRUPO A'][1][8];
    const fases = {
      ...completeGroups(),
      'Oitavas de Final': { matches: Array.from({ length: 8 }, () => ({ team1: '', team2: '' })) },
    };
    expect(resolveLibertadoresProgression(fases, tied)['Oitavas de Final'].matches[0].team1).toBe('');
  });

  it('does not advance a knockout round if a score is missing or aggregate is tied', () => {
    const fases = {
      'Oitavas de Final': { matches: [played('A', 'B'), ...Array.from({ length: 7 }, (_, i) => played(`C${i}`, `D${i}`))] },
      'Quartas de Final': { matches: Array.from({ length: 4 }, () => ({ team1: '', team2: '' })) },
    };
    fases['Oitavas de Final'].matches[0].scoreVolta1 = '';
    expect(resolveLibertadoresProgression(fases, { grupos: {} })['Quartas de Final'].matches[0].team1).toBe('');
    fases['Oitavas de Final'].matches[0].scoreVolta1 = '70';
    fases['Oitavas de Final'].matches[0].scoreVolta2 = '86';
    expect(resolveLibertadoresProgression(fases, { grupos: {} })['Quartas de Final'].matches[0].team1).toBe('');
  });
});
