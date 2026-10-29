import { describe, expect, it } from 'vitest';
import { resolveCopaBrasil2026Final } from '../../supabase/functions/_shared/providers/cartola-brasileirao/adapter-copa-brasil';

const teams: any[] = [
  { id_cartola: '101', nome: 'Time A', escudo: 'https://example.test/a.svg' },
  { id_cartola: '102', nome: 'Time B', escudo: 'https://example.test/b.svg' },
  { id_cartola: '103', nome: 'Time C', escudo: 'https://example.test/c.svg' },
  { id_cartola: '104', nome: 'Time D', escudo: 'https://example.test/d.svg' },
];

function semifinalPhase() {
  return {
    Semifinal: { matches: [
      { team1: 'Time A', team2: 'Time B', matchNumber: '1', scoreIda1: '90,00', scoreIda2: '70,00', scoreVolta1: '80,00', scoreVolta2: '75,00' },
      { team1: 'Time C', team2: 'Time D', matchNumber: '2', scoreIda1: '60,00', scoreIda2: '80,00', scoreVolta1: '70,00', scoreVolta2: '65,00' },
    ] },
    Final: { isFinal: true, matches: [
      { team1: '', team2: '', matchNumber: 'FINAL', scoreIda1: '', scoreIda2: '', scoreVolta1: '', scoreVolta2: '' },
      { team1: '', team2: '', matchNumber: '3º LUGAR', scoreIda1: '', scoreIda2: '', scoreVolta1: '', scoreVolta2: '' },
    ] },
  };
}

describe('Copa do Brasil 2026 final progression', () => {
  it('fills final and third-place fixtures from completed two-leg semifinals', () => {
    const next = resolveCopaBrasil2026Final(semifinalPhase(), teams);
    expect(next.Final.matches.map((m: any) => [m.team1, m.team2])).toEqual([
      ['Time A', 'Time D'],
      ['Time B', 'Time C'],
    ]);
    expect(next.Final.matches[0].team1Badge).toBe('https://example.test/a.svg');
    expect(next.Final.matches[1].team2Badge).toBe('https://example.test/c.svg');
  });

  it('does not create a podium until both one-off matches have winners', () => {
    const phases: any = semifinalPhase();
    phases.Final.matches = [
      { team1: 'Time A', team2: 'Time D', matchNumber: 'FINAL', scoreIda1: '95,00', scoreIda2: '85,00', scoreVolta1: '', scoreVolta2: '' },
      { team1: 'Time B', team2: 'Time C', matchNumber: '3º LUGAR', scoreIda1: '', scoreIda2: '', scoreVolta1: '', scoreVolta2: '' },
    ];
    const next = resolveCopaBrasil2026Final(phases, teams);
    expect(next.Final.podium).toBeUndefined();
  });

  it('creates the podium after the final and third-place result are known', () => {
    const phases: any = semifinalPhase();
    phases.Final.matches = [
      { team1: 'Time A', team2: 'Time D', matchNumber: 'FINAL', scoreIda1: '95,00', scoreIda2: '85,00', scoreVolta1: '', scoreVolta2: '' },
      { team1: 'Time B', team2: 'Time C', matchNumber: '3º LUGAR', scoreIda1: '88,00', scoreIda2: '80,00', scoreVolta1: '', scoreVolta2: '' },
    ];
    const next = resolveCopaBrasil2026Final(phases, teams);
    expect(next.Final.podium.map((entry: any) => [entry.position, entry.team])).toEqual([
      [1, 'Time A'], [2, 'Time D'], [3, 'Time B'],
    ]);
  });

  it('honors a manually selected semifinal winner when aggregate scores are tied', () => {
    const phases: any = semifinalPhase();
    phases.Semifinal.matches[0] = {
      ...phases.Semifinal.matches[0],
      scoreIda1: '80,00', scoreIda2: '70,00', scoreVolta1: '70,00', scoreVolta2: '80,00',
      manualWinner: 'Time B',
    };
    const next = resolveCopaBrasil2026Final(phases, teams);
    expect(next.Final.matches[0].team1).toBe('Time B');
    expect(next.Final.matches[1].team1).toBe('Time A');
  });

  it('honors a manually selected winner for a tied final match', () => {
    const phases: any = semifinalPhase();
    phases.Final.matches = [
      { team1: 'Time A', team2: 'Time D', matchNumber: 'FINAL', scoreIda1: '90,00', scoreIda2: '90,00', manualWinner: 'Time D' },
      { team1: 'Time B', team2: 'Time C', matchNumber: '3º LUGAR', scoreIda1: '88,00', scoreIda2: '80,00' },
    ];
    const next = resolveCopaBrasil2026Final(phases, teams);
    expect(next.Final.podium.map((entry: any) => [entry.position, entry.team])).toEqual([
      [1, 'Time D'], [2, 'Time A'], [3, 'Time B'],
    ]);
  });
});
