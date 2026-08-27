import { describe, it, expect } from 'vitest';
import { shadowKey, isShadowKey } from '../../supabase/functions/_shared/cache/shadowKeys.ts';
import { resolveCompareStatus } from '../../supabase/functions/_shared/cache/compareStatus.ts';
import { readLegacyTournament } from '../../supabase/functions/_shared/cache/legacy/reader.ts';
import { buildCoverageReport } from '../../supabase/functions/_shared/sync/validation/coverage.ts';

describe('shadow keys', () => {
  it('usa a mesma convenção para qualquer torneio', () => {
    expect(shadowKey('brasileirao_serie_a', 2026)).toBe('shadow/brasileirao_serie_a/2026');
    expect(shadowKey('copa_mundo', 2026)).toBe('shadow/copa_mundo/2026');
    expect(shadowKey('champions', '2026_27')).toBe('shadow/champions/2026_27');
    expect(isShadowKey(shadowKey('libertadores', 2026))).toBe(true);
  });
});

describe('compare status', () => {
  it('MATCH quando não há diferenças', () => {
    expect(resolveCompareStatus([]).status).toBe('MATCH');
  });
  it('WARNING para campos técnicos', () => {
    expect(resolveCompareStatus(['metadata', 'synced_at']).status).toBe('WARNING');
  });
  it('ERROR para campos funcionais', () => {
    const r = resolveCompareStatus(['metadata', 'classificacao']);
    expect(r.status).toBe('ERROR');
    expect(r.functional_fields).toEqual(['classificacao']);
  });
});

describe('LegacyCacheReader', () => {
  const store: Record<string, any> = {
    'classificacao:serie_a': {
      data: [
        [],
        ['', 'CLASSIFICAÇÃO'],
        ['', 'POS', '', 'TIME', 'P', 'J', 'V'],
        ['', '1', '', 'Flamengo', '10', '4', '3'],
      ],
    },

    'dados_externos:serie_a': { headers: [], rows: [['Flamengo', '', '', '123', '', 'url']] },
    'resultados:serie_a:1': {
      tournament: 'Brasileirão',
      round: 'Rodada 1',
      matches: [{ team1: 'Flamengo', team2: 'Palmeiras', score1: '2', score2: '1', matchOrder: 1 }],
    },
  };
  const read = async (k: string) => store[k] ?? null;

  it('consolida o formato multi-chave da Série A', async () => {
    const payload = await readLegacyTournament('brasileirao_serie_a', 2026, read);
    expect(payload).not.toBeNull();
    expect(Object.keys(payload!.fases)).toEqual(['rodada_1']);
    expect(payload!.dados_externos.rows).toHaveLength(1);
    expect(payload!.classificacao.grupos.geral).toHaveLength(1);
  });

  it('retorna null quando não há nada no legado', async () => {
    const payload = await readLegacyTournament('brasileirao_serie_b', 2026, async () => null);
    expect(payload).toBeNull();
  });
});

describe('coverage', () => {
  it('reporta times e confrontos faltantes', () => {
    const baseline: any = {
      version: 0,
      synced_at: '',
      fases: { rodada_1: { matches: [{ team1: 'Flamengo', team2: 'Palmeiras' }] } },
      classificacao: { grupos: { geral: [1, 2] } },
      dados_externos: { rows: [['Flamengo'], ['Palmeiras']] },
    };
    const generated: any = {
      ...baseline,
      fases: {},
      dados_externos: { rows: [['Flamengo']] },
    };
    const cov = buildCoverageReport({ baseline, generated, matches: [], standings: {} });
    expect(cov.teams_expected).toBe(2);
    expect(cov.teams_loaded).toBe(1);
    expect(cov.missing_teams).toEqual(['palmeiras']);
    expect(cov.missing_matches).toHaveLength(1);
    expect(cov.standings_expected).toBe(2);
    expect(cov.standings_generated).toBe(0);
  });
});
