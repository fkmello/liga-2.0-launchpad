import { describe, expect, it } from 'vitest';
import { isUnresolvedLibertadoresKnockoutTie } from '../utils/libertadoresKnockoutTie';

describe('isUnresolvedLibertadoresKnockoutTie', () => {
  it('detecta empate no agregado quando os dois jogos foram disputados', () => {
    expect(isUnresolvedLibertadoresKnockoutTie({
      team1: 'Time A', team2: 'Time B',
      scoreIda1: '2,00', scoreIda2: '1,00',
      scoreVolta1: '0,00', scoreVolta2: '1,00',
    }, 'Oitavas de Final')).toBe(true);
  });

  it('não sinaliza confronto decidido no agregado', () => {
    expect(isUnresolvedLibertadoresKnockoutTie({
      team1: 'Time A', team2: 'Time B',
      scoreIda1: '2', scoreIda2: '0',
      scoreVolta1: '1', scoreVolta2: '1',
    }, 'Quartas de Final')).toBe(false);
  });

  it('não sinaliza empate no agregado enquanto faltar placar da volta', () => {
    expect(isUnresolvedLibertadoresKnockoutTie({
      team1: 'Time A', team2: 'Time B',
      scoreIda1: '1', scoreIda2: '1',
      scoreVolta1: '', scoreVolta2: '',
    }, 'Semifinal')).toBe(false);
  });

  it('não sinaliza empate quando os times ainda não estão definidos', () => {
    expect(isUnresolvedLibertadoresKnockoutTie({
      team1: '', team2: '',
      scoreIda1: '1', scoreIda2: '1',
      scoreVolta1: '0', scoreVolta2: '0',
    }, 'Semifinal')).toBe(false);
  });

  it('não solicita novo desempate quando já existe vencedor manual', () => {
    expect(isUnresolvedLibertadoresKnockoutTie({
      team1: 'Time A', team2: 'Time B',
      scoreIda1: '1', scoreIda2: '1',
      scoreVolta1: '0', scoreVolta2: '0',
      manualWinner: 'Time B',
    }, 'Semifinal')).toBe(false);
  });

  it('detecta empate em jogo único da final sem exigir placar de volta', () => {
    expect(isUnresolvedLibertadoresKnockoutTie({
      team1: 'Time A', team2: 'Time B',
      matchNumber: 'FINAL',
      scoreIda1: '1', scoreIda2: '1',
    }, 'Final')).toBe(true);
  });

  it('detecta empate em jogo único da disputa de terceiro lugar', () => {
    expect(isUnresolvedLibertadoresKnockoutTie({
      team1: 'Time A', team2: 'Time B',
      matchNumber: '3º LUGAR',
      scoreIda1: '0', scoreIda2: '0',
    }, 'Final')).toBe(true);
  });

  it('não trata jogo único de outra fase como final', () => {
    expect(isUnresolvedLibertadoresKnockoutTie({
      team1: 'Time A', team2: 'Time B',
      matchNumber: 'FINAL',
      scoreIda1: '1', scoreIda2: '1',
    }, 'Semifinal')).toBe(false);
  });
});
