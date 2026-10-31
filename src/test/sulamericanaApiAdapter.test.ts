import { describe, expect, it } from 'vitest';
import { updateSulamericanaFinal, SULAMERICANA_SYNCABLE_TARGET_ROUNDS } from '../../supabase/functions/_shared/providers/cartola-brasileirao/adapter-sulamericana';
import { resolveDefinition, selectAdapters } from '../../supabase/functions/_shared/tournament/registry';

describe('Sul-Americana API adapter', () => {
  it('mapeia exclusivamente a rodada 37 como alvo sincronizável', () => {
    expect(SULAMERICANA_SYNCABLE_TARGET_ROUNDS).toEqual([37]);
  });

  it('atualiza os dois jogos únicos da final com as pontuações da API', () => {
    const fases = {
      Final: {
        matches: [
          { team1: 'Campeão A', team2: 'Campeão B', scoreIda1: '', scoreIda2: '', matchNumber: 'FINAL' },
          { team1: 'Terceiro A', team2: 'Terceiro B', scoreIda1: '', scoreIda2: '', matchNumber: '3º LUGAR' },
        ],
      },
      Semifinal: { matches: [{ team1: 'A', team2: 'B', scoreIda1: '10,00' }] },
    };
    const scores = new Map([['1', 91.25], ['2', 82.5], ['3', 77.75], ['4', 70.1]]);
    const ids = new Map([
      ['campeaoa', '1'], ['campeaob', '2'], ['terceiroa', '3'], ['terceirob', '4'],
    ]);

    const result = updateSulamericanaFinal(fases, 37, scores, ids);
    expect(result.Final.matches[0]).toMatchObject({ scoreIda1: '91,25', scoreIda2: '82,50' });
    expect(result.Final.matches[1]).toMatchObject({ scoreIda1: '77,75', scoreIda2: '70,10' });
    expect(result.Semifinal).toEqual(fases.Semifinal);
  });

  it('preserva placares anteriores quando a API não devolve pontuação', () => {
    const fases = { Final: { matches: [{ team1: 'A', team2: 'B', scoreIda1: '88,00', scoreIda2: '79,00' }] } };
    const result = updateSulamericanaFinal(fases, 37, new Map([['1', null], ['2', 90]]), new Map([['a', '1'], ['b', '2']]));
    expect(result.Final.matches[0]).toMatchObject({ scoreIda1: '88,00', scoreIda2: '90,00' });
  });

  it('não altera dados quando a rodada não é a 37', () => {
    const fases = { Final: { matches: [{ team1: 'A', team2: 'B', scoreIda1: '', scoreIda2: '' }] } };
    expect(updateSulamericanaFinal(fases, 36, new Map([['1', 90]]), new Map([['a', '1']]))).toBe(fases);
  });
});

describe('Sul-Americana registry', () => {
  it('habilita cron/API na temporada 2026 mantendo persistência shadow', () => {
    const { def, season } = resolveDefinition('sulamericana');
    expect(season).toBe(2026);
    expect(def.activeSync).toBe('api');
    expect(def.persistMode).toBe('shadow');
    expect(def.cacheKey(season)).toBe('sulamericana:2026');
    expect(def.cron?.enabled).toBe(true);
    expect(def.cron?.syncableTargetRounds).toEqual([37]);
    expect(selectAdapters(def).map((adapter) => adapter.id)).toEqual(['cartola_brasileirao_sulamericana_v1']);
  });
});
