import { describe, expect, it } from 'vitest';
import { resolveLibertadoresPodium } from '../utils/libertadoresResults';

describe('resolveLibertadoresPodium', () => {
  it('returns champion, runner-up and third place only after both decisive matches finish', () => {
    const podium = resolveLibertadoresPodium([
      {
        matchNumber: 'FINAL',
        team1: 'Time A',
        team2: 'Time B',
        scoreIda1: '101,50',
        scoreIda2: '88,25',
      },
      {
        matchNumber: '3º LUGAR',
        team1: 'Time C',
        team2: 'Time D',
        scoreIda1: '75,00',
        scoreIda2: '90,00',
      },
    ]);

    expect(podium).toEqual({
      champion: 'Time A',
      runnerUp: 'Time B',
      third: 'Time D',
    });
  });

  it('waits when the final or third-place match is missing a score', () => {
    expect(resolveLibertadoresPodium([
      { matchNumber: 'FINAL', team1: 'Time A', team2: 'Time B', scoreIda1: '100', scoreIda2: '' },
      { matchNumber: '3º LUGAR', team1: 'Time C', team2: 'Time D', scoreIda1: '90', scoreIda2: '80' },
    ])).toBeNull();

    expect(resolveLibertadoresPodium([
      { matchNumber: 'FINAL', team1: 'Time A', team2: 'Time B', scoreIda1: '100', scoreIda2: '80' },
      { matchNumber: '3º LUGAR', team1: 'Time C', team2: 'Time D', scoreIda1: '90', scoreIda2: '' },
    ])).toBeNull();
  });

  it('waits for a manual decision if either single-match fixture is tied', () => {
    expect(resolveLibertadoresPodium([
      {
        matchNumber: 'FINAL',
        team1: 'Time A',
        team2: 'Time B',
        scoreIda1: '100',
        scoreIda2: '100',
      },
      {
        matchNumber: '3º LUGAR',
        team1: 'Time C',
        team2: 'Time D',
        scoreIda1: '80',
        scoreIda2: '70',
      },
    ])).toBeNull();
  });

  it('recognizes the final and third-place labels regardless of accents or surrounding whitespace', () => {
    expect(resolveLibertadoresPodium([
      { matchNumber: ' FINAL ', team1: 'Time A', team2: 'Time B', scoreIda1: '80', scoreIda2: '70' },
      { matchNumber: '3º LUGAR', team1: 'Time C', team2: 'Time D', scoreIda1: '70', scoreIda2: '80' },
    ])).toEqual({
      champion: 'Time A',
      runnerUp: 'Time B',
      third: 'Time D',
    });
  });
});
