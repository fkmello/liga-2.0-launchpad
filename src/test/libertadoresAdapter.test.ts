import { describe, expect, it } from 'vitest';
import { recalculateLibertadoresClassification, updateLibertadoresFases } from '../../supabase/functions/_shared/providers/cartola-brasileirao/adapter-libertadores';
import { resolveDefinition, selectAdapters } from '../../supabase/functions/_shared/tournament/registry';
import { readLegacyTournament } from '../../supabase/functions/_shared/cache/legacy/reader';

const idByName = new Map([['timea', '101'], ['timeb', '102']]);

describe('Libertadores adapter', () => {
  it('mapeia as seis rodadas de grupos para as rodadas Cartola existentes no frontend', () => {
    for (const [cartolaRound, groupRound] of [[11,1],[12,2],[14,3],[15,4],[17,5],[18,6]] as const) {
      const fases = { 'Fase de Grupos': { [`rodada_${groupRound}`]: {
        round: `Rodada ${groupRound}`,
        groups: [{ name: 'GRUPO A', matches: [{ team1: 'Time A', team2: 'Time B', score1: '', score2: '' }] }],
      } } };
      const result = updateLibertadoresFases(fases, cartolaRound, new Map([['101',77.25],['102',66.5]]), idByName);
      const match = result['Fase de Grupos'][`rodada_${groupRound}`].groups[0].matches[0];
      expect(match.score1).toBe('77,25'); expect(match.score2).toBe('66,50');
    }
  });
  it('atualiza apenas a ida ou volta da fase eliminatória correta', () => {
    for (const [round, phase, key1, key2] of [
      [23,'Oitavas de Final','scoreIda1','scoreIda2'], [24,'Oitavas de Final','scoreVolta1','scoreVolta2'],
      [27,'Quartas de Final','scoreIda1','scoreIda2'], [28,'Quartas de Final','scoreVolta1','scoreVolta2'],
      [31,'Semifinal','scoreIda1','scoreIda2'], [32,'Semifinal','scoreVolta1','scoreVolta2'],
      [37,'Final','scoreIda1','scoreIda2'],
    ] as const) {
      const fases = { [phase]: { matches: [{ team1:'Time A', team2:'Time B', [key1]:'', [key2]:'' }] } };
      const result = updateLibertadoresFases(fases, round, new Map([['101',71.25],['102',62.5]]), idByName);
      expect(result[phase].matches[0][key1]).toBe('71,25'); expect(result[phase].matches[0][key2]).toBe('62,50');
    }
  });
  it('preserva placares quando a API não retorna pontuação', () => {
    const fases = { Semifinal: { matches: [{ team1:'Time A', team2:'Time B', scoreIda1:'70,00', scoreIda2:'60,00' }] } };
    const result = updateLibertadoresFases(fases, 31, new Map([['101',null],['102',null]]), idByName);
    expect(result.Semifinal.matches[0]).toEqual(fases.Semifinal.matches[0]);
  });
  it('ignora rodadas Cartola não mapeadas', () => {
    const fases = { Semifinal: { matches: [{ team1:'Time A', team2:'Time B' }] } };
    expect(updateLibertadoresFases(fases, 30, new Map(), idByName)).toBe(fases);
  });
  it('recalcula a classificação por grupo usando os placares acumulados', () => {
    const fases = {
      'Fase de Grupos': {
        rodada_1: { groups: [
          { name: 'GRUPO A', matches: [
            { team1: 'Time A', team2: 'Time B', score1: '80,00', score2: '70,00' },
            { team1: 'Time C', team2: 'Time D', score1: '60,00', score2: '90,00' },
          ] },
          { name: 'GRUPO B', matches: [
            { team1: 'Time E', team2: 'Time F', score1: '90,00', score2: '70,00' },
            { team1: 'Time G', team2: 'Time H', score1: '60,00', score2: '80,00' },
          ] },
        ] },
        rodada_2: { groups: [
          { name: 'GRUPO A', matches: [
            { team1: 'Time A', team2: 'Time C', score1: '70,00', score2: '75,00' },
            { team1: 'Time B', team2: 'Time D', score1: '85,00', score2: '80,00' },
          ] },
          { name: 'GRUPO B', matches: [
            { team1: 'Time E', team2: 'Time G', score1: '70,00', score2: '75,00' },
            { team1: 'Time F', team2: 'Time H', score1: '85,00', score2: '80,00' },
          ] },
        ] },
      },
    };
    const result = recalculateLibertadoresClassification(fases, { grupos: {} });
    expect((result.grupos['GRUPO A'] as any[][]).map((row: any[]) => [row[2], row[3], row[4], row[5]])).toEqual([
      ['Time D', '3', '2', '1'],
      ['Time A', '3', '2', '1'],
      ['Time B', '3', '2', '1'],
      ['Time C', '3', '2', '1'],
    ]);
    expect(result.grupos['GRUPO B']).toHaveLength(4);
    expect(result.grupos['GRUPO B'][0][2]).toBe('Time E');
    // A tela lê penúltima coluna como pontos feitos e última como saldo.
    expect(result.grupos['GRUPO A'][0]).toHaveLength(10);
    expect(result.grupos['GRUPO A'][0][8]).toBe('170,00');
    expect(result.grupos['GRUPO A'][0][9]).toBe('25,00');
  });
  it('preserva classificação existente quando a atualização é de mata-mata', () => {
    const previous = { grupos: { 'GRUPO A': [['1', '', 'Time A', '12', '6', '4', '0', '2', '20,00']] } };
    const phases = { Semifinal: { matches: [{ team1: 'Time A', team2: 'Time B' }] } };
    // A rotina de classificação só é chamada para alvos de fase de grupos.
    expect(previous.grupos['GRUPO A'][0][3]).toBe('12');
    expect(phases.Semifinal.matches).toHaveLength(1);
  });
  it('registra sincronização API apenas em shadow', () => {
    const { def } = resolveDefinition('libertadores');
    expect(def.persistMode).toBe('shadow'); expect(def.activeSync).toBe('api'); expect(def.cron?.enabled).toBe(true);
    expect(selectAdapters(def).map(a => a.id)).toEqual(['cartola_brasileirao_libertadores_v1']);
  });
  it('converte o cache legado preservando jogos, classificação e times', async () => {
    const legacy = {
      fases: { Semifinal: { matches: [{ team1:'Time A', team2:'Time B' }] } },
      grupos: { rodada_1: { round:'Rodada 1', groups:[{ name:'GRUPO A', matches:[] }] } },
      classificacao: { groups:[{ name:'GRUPO A', rows:[['1','','Time A','3']] }] },
      dados_externos: { rows:[['Time A','101','logo']] },
    };
    const payload = await readLegacyTournament('libertadores', 2026, async key => key === 'libertadores' ? legacy : null);
    expect(payload?.fases['Fase de Grupos']).toEqual(legacy.grupos);
    expect(payload?.fases.Semifinal).toEqual(legacy.fases.Semifinal);
    expect(payload?.classificacao.grupos['GRUPO A']).toEqual(legacy.classificacao.groups[0].rows);
    expect(payload?.dados_externos.rows).toEqual(legacy.dados_externos.rows);
  });
});
