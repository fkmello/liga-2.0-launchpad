import { describe, expect, it } from 'vitest';
import { resolveLibertadoresFinalResult } from '../utils/libertadoresResults';
import { recalculateLibertadoresClassification, resolveLibertadoresClassification, resolveLibertadoresFinalists, resolveLibertadoresProgression, shouldRecalculateLibertadoresClassification, updateLibertadoresFases } from '../../supabase/functions/_shared/providers/cartola-brasileirao/adapter-libertadores';
import { resolveDefinition, selectAdapters } from '../../supabase/functions/_shared/tournament/registry';
import { readLegacyTournament } from '../../supabase/functions/_shared/cache/legacy/reader';
import { mergeLibertadoresFasesPreservingScores } from '../../supabase/functions/_shared/cache/roundPreservation';

const idByName = new Map([['timea', '101'], ['timeb', '102']]);

describe('Libertadores adapter', () => {
  it('preserva decisões manuais ao recalcular a classificação dos grupos', () => {
    const decisions = { grupos: { 'GRUPO A': ['Time A', 'Time B'] }, global: ['Time A', 'Time B'] };
    const fases: any = {
      'Fase de Grupos': {
        rodada_1: { groups: [{ name: 'GRUPO A', matches: [{ team1: 'Time A', team2: 'Time B', score1: '80,00', score2: '70,00' }] }] },
      },
    };
    const result = resolveLibertadoresClassification(fases, 11, {
      grupos: {},
      desempatesManuais: decisions,
    } as any) as any;
    expect(result.desempatesManuais).toEqual(decisions);
  });

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

  it('preenche final e terceiro lugar com os vencedores e perdedores pelo agregado da ida e volta', () => {
    const fases = {
      Semifinal: { matches: [
        { team1: 'Riverao FC', team2: 'Tatu Frito', scoreIda1: '97,19', scoreIda2: '83,49', scoreVolta1: '86,56', scoreVolta2: '93,31' },
        { team1: 'Red Label SFX', team2: 'DOMINANTE E.C 2024', scoreIda1: '84,96', scoreIda2: '90,24', scoreVolta1: '101,76', scoreVolta2: '72,16' },
      ] },
      Final: { fase: 'Final', isFinal: true, matches: [
        { team1: '', team2: '', matchNumber: 'FINAL', scoreIda1: '', scoreIda2: '', scoreVolta1: '', scoreVolta2: '' },
        { team1: '', team2: '', matchNumber: '3º LUGAR', scoreIda1: '', scoreIda2: '', scoreVolta1: '', scoreVolta2: '' },
      ] },
    };
    const result = resolveLibertadoresFinalists(fases);
    expect(result.Final.matches[0].team1).toBe('Riverao FC');
    expect(result.Final.matches[0].team2).toBe('Red Label SFX');
    expect(result.Final.matches[1].team1).toBe('Tatu Frito');
    expect(result.Final.matches[1].team2).toBe('DOMINANTE E.C 2024');
    // Não altera os placares da final/terceiro lugar, que ainda não foram disputados.
    expect(result.Final.matches[0].scoreIda1).toBe('');
  });

  it('não define classificados se faltar placar de semifinal ou houver empate no agregado', () => {
    const fases = {
      Semifinal: { matches: [
        { team1: 'Time A', team2: 'Time B', scoreIda1: '80,00', scoreIda2: '70,00', scoreVolta1: '70,00', scoreVolta2: '80,00' },
        { team1: 'Time C', team2: 'Time D', scoreIda1: '90,00', scoreIda2: '80,00', scoreVolta1: '', scoreVolta2: '' },
      ] },
      Final: { matches: [{ team1: '', team2: '', matchNumber: 'FINAL' }, { team1: '', team2: '', matchNumber: '3º LUGAR' }] },
    };
    const result = resolveLibertadoresFinalists(fases);
    expect(result.Final.matches[0].team1).toBe('');
    expect(result.Final.matches[1].team2).toBe('');
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
  it('só permite recalcular a classificação nas seis rodadas da fase de grupos', () => {
    for (const round of [11, 12, 14, 15, 17, 18]) {
      expect(shouldRecalculateLibertadoresClassification(round)).toBe(true);
    }
  });
  it('não recalcula a classificação em rodadas eliminatórias ou não mapeadas', () => {
    const previous = { grupos: { 'GRUPO A': [['1', '', 'Time A', '12', '6', '4', '0', '2', '20,00']] } };
    for (const round of [23, 24, 27, 28, 31, 32, 37, 30, null]) {
      expect(shouldRecalculateLibertadoresClassification(round)).toBe(false);
    }
    const fases = { 'Fase de Grupos': { rodada_1: { groups: [] } } };
    for (const round of [23, 24, 27, 28, 31, 32, 37, 30, null]) {
      expect(resolveLibertadoresClassification(fases, round, previous)).toBe(previous);
    }
  });
  it('registra sincronização API em shadow e mantém o cache oficial protegido com cron habilitado', () => {
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

  it('preenche as oitavas em ordem global de classificação somente com grupos completos', () => {
    const grupos: Record<string, unknown[]> = {};
    const groupMatches: any[] = [];
    for (let groupIndex = 0; groupIndex < 8; groupIndex++) {
      const team1 = `Time ${String(groupIndex * 2 + 1).padStart(2, '0')}`;
      const team2 = `Time ${String(groupIndex * 2 + 2).padStart(2, '0')}`;
      grupos[`Grupo ${groupIndex + 1}`] = [
        [ '1', '', team1, String(32 - groupIndex), '6', '6', '0', '0', '600,00', String(60 - groupIndex) ],
        [ '2', '', team2, String(16 - groupIndex), '6', '4', '0', '2', '400,00', String(30 - groupIndex) ],
      ];
      groupMatches.push({ name: `Grupo ${groupIndex + 1}`, matches: [{ team1, team2, score1: '80,00', score2: '70,00' }] });
    }
    const fases: any = { 'Fase de Grupos': {}, 'Oitavas de Final': { matches: Array.from({ length: 8 }, (_, i) => ({ matchNumber: String(i + 1), team1: '', team2: '' })) } };
    for (let round = 1; round <= 6; round++) fases['Fase de Grupos'][`rodada_${round}`] = { groups: groupMatches };
    const result = resolveLibertadoresProgression(fases, { grupos });
    expect(result['Oitavas de Final'].matches.map((m: any) => [m.team1, m.team2])).toEqual([
      ['Time 01', 'Time 16'], ['Time 03', 'Time 14'], ['Time 05', 'Time 12'], ['Time 07', 'Time 10'],
      ['Time 09', 'Time 08'], ['Time 11', 'Time 06'], ['Time 13', 'Time 04'], ['Time 15', 'Time 02'],
    ]);
    const incomplete = { ...fases, 'Fase de Grupos': { ...fases['Fase de Grupos'], rodada_6: { groups: [{ name: 'Grupo 1', matches: [{ team1: 'Time 01', team2: 'Time 02', score1: '', score2: '' }] }] } } };
    expect(resolveLibertadoresProgression(incomplete, { grupos })['Oitavas de Final'].matches[0].team1).toBe('');
  });

  it('avança oitavas para quartas e quartas para semifinal apenas com vencedores definidos', () => {
    const makeMatches = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => ({
      team1: `${prefix}A${i}`, team2: `${prefix}B${i}`,
      scoreIda1: '80,00', scoreIda2: '70,00', scoreVolta1: i === 0 ? '70,00' : '75,00', scoreVolta2: '70,00',
    }));
    const fases: any = {
      'Oitavas de Final': { matches: makeMatches('O', 8) },
      'Quartas de Final': { matches: Array.from({ length: 4 }, () => ({ team1: '', team2: '' })) },
      Semifinal: { matches: Array.from({ length: 2 }, () => ({ team1: '', team2: '' })) },
      Final: { matches: [{ matchNumber: 'FINAL', team1: '', team2: '' }, { matchNumber: '3º LUGAR', team1: '', team2: '' }] },
    };
    const result = resolveLibertadoresProgression(fases, { grupos: {} });
    expect(result['Quartas de Final'].matches.map((m: any) => [m.team1, m.team2])).toEqual([
      ['OA0', 'OA1'], ['OA2', 'OA3'], ['OA4', 'OA5'], ['OA6', 'OA7'],
    ]);
    expect(result.Semifinal.matches.every((m: any) => m.team1 && m.team2)).toBe(false);
  });

  it('respeita vencedor manual persistido no confronto quando o agregado empata', () => {
    const fases: any = {
      'Oitavas de Final': { matches: Array.from({ length: 8 }, (_, i) => ({
        team1: `Time A${i}`, team2: `Time B${i}`,
        scoreIda1: '80,00', scoreIda2: '70,00', scoreVolta1: i === 0 ? '70,00' : '75,00', scoreVolta2: '80,00',
        ...(i === 0 ? { manualWinner: `Time B${i}` } : {}),
      })) },
      'Quartas de Final': { matches: Array.from({ length: 4 }, () => ({ team1: '', team2: '' })) },
      Semifinal: { matches: Array.from({ length: 2 }, () => ({ team1: '', team2: '' })) },
    };
    const result = resolveLibertadoresProgression(fases, { grupos: {} });
    expect(result['Quartas de Final'].matches[0].team1).toBe('Time B0');
    expect(result['Quartas de Final'].matches[0].team2).toBe('Time A1');
  });

  it('gera oitavas após aplicar ordens manuais para empates de grupo e da classificação geral', () => {
    const grupos: Record<string, unknown[]> = {};
    const groupMatches: any[] = [];
    const groupOrders: Record<string, string[]> = {};
    const globalOrder: string[] = [];
    for (let i = 0; i < 8; i++) {
      const a = `A${i}`, b = `B${i}`;
      grupos[`Grupo ${i}`] = [
        ['1', '', a, '10', '6', '3', '1', '2', '300,00', '10,00'],
        ['2', '', b, '10', '6', '3', '1', '2', '300,00', '10,00'],
      ];
      groupOrders[`Grupo ${i}`] = [a, b];
      globalOrder.push(a, b);
      groupMatches.push({ name: `Grupo ${i}`, matches: [{ team1: a, team2: b, score1: '80,00', score2: '70,00' }] });
    }
    const fases: any = { 'Fase de Grupos': {}, 'Oitavas de Final': { matches: Array.from({ length: 8 }, () => ({ team1: '', team2: '' })) } };
    for (let round = 1; round <= 6; round++) fases['Fase de Grupos'][`rodada_${round}`] = { groups: groupMatches };
    const result = resolveLibertadoresProgression(fases, {
      grupos,
      desempatesManuais: { grupos: groupOrders, global: globalOrder },
    } as any);
    expect(result['Oitavas de Final'].matches.every((match: any) => match.team1 && match.team2)).toBe(true);
    expect(result['Oitavas de Final'].matches[0].team1).toBe('A0');
    expect(result['Oitavas de Final'].matches[0].team2).toBe('B7');
  });

  it('não gera oitavas quando há empate completo nos critérios de classificação do grupo', () => {
    const grupos: Record<string, unknown[]> = {};
    const groupMatches: any[] = [];
    for (let i = 0; i < 8; i++) {
      const a = `A${i}`, b = `B${i}`;
      grupos[`Grupo ${i}`] = [
        ['1', '', a, '10', '6', '3', '1', '2', '300,00', '10,00'],
        ['2', '', b, '10', '6', '3', '1', '2', '300,00', '10,00'],
      ];
      groupMatches.push({ name: `Grupo ${i}`, matches: [{ team1: a, team2: b, score1: '80,00', score2: '70,00' }] });
    }
    const fases: any = { 'Fase de Grupos': {}, 'Oitavas de Final': { matches: Array.from({ length: 8 }, () => ({ team1: '', team2: '' })) } };
    for (let round = 1; round <= 6; round++) fases['Fase de Grupos'][`rodada_${round}`] = { groups: groupMatches };
    const result = resolveLibertadoresProgression(fases, { grupos });
    expect(result['Oitavas de Final'].matches.every((match: any) => !match.team1 && !match.team2)).toBe(true);
  });
});


describe('Libertadores single-match final and third-place results', () => {
  it('resolves the winner of a single-leg final without requiring a second leg', () => {
    expect(resolveLibertadoresFinalResult({
      team1: 'Riverao FC', team2: 'Red Label SFX',
      scoreIda1: '101,76', scoreIda2: '84,96',
    })).toEqual({ winner: 'Riverao FC', loser: 'Red Label SFX' });
  });

  it('waits for manual draw resolution when the single-match score is tied', () => {
    expect(resolveLibertadoresFinalResult({
      team1: 'Time A', team2: 'Time B', scoreIda1: '90,00', scoreIda2: '90,00',
    })).toBeNull();
    expect(resolveLibertadoresFinalResult({
      team1: 'Time A', team2: 'Time B', scoreIda1: '90,00', scoreIda2: '90,00',
      manualWinner: 'Time B',
    })).toEqual({ winner: 'Time B', loser: 'Time A' });
  });

  it('does not resolve the podium while either final score is missing', () => {
    expect(resolveLibertadoresFinalResult({
      team1: 'Time A', team2: 'Time B', scoreIda1: '90,00', scoreIda2: '',
    })).toBeNull();
  });
});


describe('Libertadores manual decision cache preservation', () => {
  it('preserves a manual knockout winner when the next API payload omits that field', () => {
    const previous = {
      Final: { matches: [{
        matchNumber: 'FINAL', team1: 'Riverao FC', team2: 'Red Label SFX',
        scoreIda1: '101,00', scoreIda2: '101,00', manualWinner: 'Red Label SFX',
      }] },
    };
    const next = {
      Final: { matches: [{
        matchNumber: 'FINAL', team1: 'Riverao FC', team2: 'Red Label SFX',
        scoreIda1: '101,00', scoreIda2: '101,00',
      }] },
    };
    const merged = mergeLibertadoresFasesPreservingScores(previous, next) as any;
    expect(merged.Final.matches[0].manualWinner).toBe('Red Label SFX');
  });
});
