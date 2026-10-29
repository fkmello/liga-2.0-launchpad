import { describe, expect, it } from 'vitest';
import { applyManualLibertadoresWinner } from '../utils/applyManualLibertadoresWinner';

const tiedPayload = () => ({
  fases: {
    'Oitavas de Final': {
      matches: [{
        matchNumber: '1',
        team1: 'Time A',
        team2: 'Time B',
        scoreIda1: '2,00',
        scoreIda2: '1,00',
        scoreVolta1: '0,00',
        scoreVolta2: '1,00',
      }],
    },
  },
});

describe('applyManualLibertadoresWinner', () => {
  it('aplica o vencedor escolhido ao confronto empatado', () => {
    const payload = tiedPayload();
    const result = applyManualLibertadoresWinner(payload, 'Oitavas de Final', '1', 'Time B');

    expect(result.fases['Oitavas de Final'].matches[0].manualWinner).toBe('Time B');
    expect(result).toBe(payload);
  });

  it('aceita matchNumber sem diferença de maiúsculas ou espaços', () => {
    const payload = tiedPayload();
    expect(() => applyManualLibertadoresWinner(payload, 'Oitavas de Final', ' 1 ', 'Time A')).not.toThrow();
  });

  it('rejeita um vencedor que não participa do confronto', () => {
    expect(() => applyManualLibertadoresWinner(tiedPayload(), 'Oitavas de Final', '1', 'Time C'))
      .toThrow('O confronto mudou ou não está mais empatado');
  });

  it('rejeita confronto que não está empatado no agregado', () => {
    const payload = tiedPayload();
    payload.fases['Oitavas de Final'].matches[0].scoreVolta2 = '2,00';
    expect(() => applyManualLibertadoresWinner(payload, 'Oitavas de Final', '1', 'Time B'))
      .toThrow('O confronto mudou ou não está mais empatado');
  });

  it('rejeita fase inexistente no cache', () => {
    expect(() => applyManualLibertadoresWinner(tiedPayload(), 'Semifinal', '1', 'Time B'))
      .toThrow('A fase Semifinal não foi encontrada no cache');
  });
});
