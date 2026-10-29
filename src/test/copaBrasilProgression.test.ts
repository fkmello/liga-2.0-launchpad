import { describe, expect, it } from 'vitest';
import { resolveCopaBrasilProgression } from '../../supabase/functions/_shared/providers/cartola-brasileirao/adapter-copa-brasil';

function setup() {
  const rows = [
    ...Array.from({ length: 56 }, (_, i) => [String(1000 + i), '', '', 'preliminar']),
    ...Array.from({ length: 4 }, (_, i) => [String(2000 + i), '', '', 'convidado']),
  ];
  const teams = rows.map((row, i) => ({
    id_cartola: row[0],
    nome: i < 56 ? `Prelim ${i + 1}` : `Convidado ${i - 55}`,
    escudo: `https://example.test/${row[0]}.svg`,
  }));
  const fases = {
    '1ª Fase': { matches: Array.from({ length: 28 }, (_, i) => ({
      team1: '', team2: '', matchNumber: String(i + 1),
      scoreIda1: '', scoreIda2: '', scoreVolta1: '', scoreVolta2: '',
    })) },
    '2ª Fase': { matches: Array.from({ length: 16 }, (_, i) => ({
      team1: '', team2: '', matchNumber: String(i + 1),
      scoreIda1: '', scoreIda2: '', scoreVolta1: '', scoreVolta2: '',
    })) },
    'Oitavas de Final': { matches: Array.from({ length: 8 }, (_, i) => ({
      team1: '', team2: '', matchNumber: String(i + 1),
      scoreIda1: '', scoreIda2: '', scoreVolta1: '', scoreVolta2: '',
    })) },
    'Quartas de Final': { matches: Array.from({ length: 4 }, (_, i) => ({
      team1: '', team2: '', matchNumber: String(i + 1),
      scoreIda1: '', scoreIda2: '', scoreVolta1: '', scoreVolta2: '',
    })) },
    Semifinal: { matches: Array.from({ length: 2 }, (_, i) => ({
      team1: '', team2: '', matchNumber: String(i + 1),
      scoreIda1: '', scoreIda2: '', scoreVolta1: '', scoreVolta2: '',
    })) },
    Final: { matches: [
      { team1: '', team2: '', matchNumber: 'FINAL', scoreIda1: '', scoreIda2: '', scoreVolta1: '', scoreVolta2: '' },
      { team1: '', team2: '', matchNumber: '3º LUGAR', scoreIda1: '', scoreIda2: '', scoreVolta1: '', scoreVolta2: '' },
    ] },
  };
  return { rows, teams, fases };
}

function completePhase(matches: any[]) {
  return matches.map((match) => ({
    ...match,
    scoreIda1: '80,00',
    scoreIda2: '60,00',
    scoreVolta1: '80,00',
    scoreVolta2: '60,00',
  }));
}

describe('Copa do Brasil automatic draws and progression', () => {
  it('draws the 56 preliminary entrants once and keeps all participants unique', () => {
    const { rows, teams, fases } = setup();
    const first = resolveCopaBrasilProgression(fases, rows, teams);
    const matches = first['1ª Fase'].matches;
    const entrants = matches.flatMap((match: any) => [match.team1, match.team2]);

    expect(first['1ª Fase'].drawLocked).toBe(true);
    expect(matches).toHaveLength(28);
    expect(entrants).toHaveLength(56);
    expect(new Set(entrants).size).toBe(56);
    expect(matches.every((match: any) => match.team1Id && match.team2Id &&
      Number.isInteger(match.team1Slot) && Number.isInteger(match.team2Slot))).toBe(true);

    const second = resolveCopaBrasilProgression(first, rows, teams);
    expect(second['1ª Fase'].matches.map((m: any) => [m.team1, m.team2]))
      .toEqual(matches.map((m: any) => [m.team1, m.team2]));
  });

  it('draws 28 winners plus four invited teams into 16 second-phase fixtures only once', () => {
    const { rows, teams, fases } = setup();
    let next = resolveCopaBrasilProgression(fases, rows, teams);
    next = { ...next, '1ª Fase': { ...next['1ª Fase'], matches: completePhase(next['1ª Fase'].matches) } };
    next = resolveCopaBrasilProgression(next, rows, teams);

    const second = next['2ª Fase'].matches;
    expect(next['2ª Fase'].drawLocked).toBe(true);
    expect(second).toHaveLength(16);
    expect(second.flatMap((match: any) => [match.team1, match.team2])).toHaveLength(32);
    expect(new Set(second.flatMap((match: any) => [match.team1, match.team2])).size).toBe(32);
    expect(second.flatMap((match: any) => [match.team1, match.team2]))
      .toEqual(expect.arrayContaining(teams.map((team) => team.nome).filter((name) => name.startsWith('Convidado'))));

    const repeated = resolveCopaBrasilProgression(next, rows, teams);
    expect(repeated['2ª Fase'].matches.map((m: any) => [m.team1, m.team2]))
      .toEqual(second.map((m: any) => [m.team1, m.team2]));
  });

  it('progresses through the fixed bracket and applies a row-slot replacement only to the next phase', () => {
    const { rows, teams, fases } = setup();
    let next = resolveCopaBrasilProgression(fases, rows, teams);
    next = { ...next, '1ª Fase': { ...next['1ª Fase'], matches: completePhase(next['1ª Fase'].matches) } };
    next = resolveCopaBrasilProgression(next, rows, teams);
    next = { ...next, '2ª Fase': { ...next['2ª Fase'], matches: completePhase(next['2ª Fase'].matches) } };
    next = resolveCopaBrasilProgression(next, rows, teams);

    expect(next['Oitavas de Final'].matches.every((match: any) => match.team1 && match.team2)).toBe(true);
    const historicalName = next['2ª Fase'].matches[0].team1;
    const replacementSlot = next['2ª Fase'].matches[0].team1Slot;
    const replacementId = '999999';
    const changedRows = rows.map((row, index) => index === replacementSlot
      ? [replacementId, '', '', row[3]]
      : row);
    const changedTeams = [
      ...teams.filter((team) => team.id_cartola !== rows[replacementSlot][0]),
      { id_cartola: replacementId, nome: 'Time Substituto', escudo: 'https://example.test/substitute.svg' },
    ];

    const replaced = resolveCopaBrasilProgression(next, changedRows, changedTeams);
    expect(replaced['2ª Fase'].matches[0].team1).toBe(historicalName);
    expect(replaced['Oitavas de Final'].matches.some((match: any) => match.team1 === 'Time Substituto' || match.team2 === 'Time Substituto')).toBe(true);
  });
});
