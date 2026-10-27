import { describe, expect, it } from 'vitest';
import { resolveSemanticCompareStatus } from '../../supabase/functions/_shared/cache/compareStatus';
import { buildCoverageReport } from '../../supabase/functions/_shared/sync/validation/coverage';
import { diffLibertadoresClassification } from '../../supabase/functions/_shared/sync/validation/standingsDiff';

const oldRow = ['1', '', 'Time A', '12', '6', '4', '0', '2', '28,00'];
const newRow = ['1', '', 'Time A', '12', '6', '4', '0', '2', '474,85', '28,00'];

describe('pipeline validation indicators', () => {
  it('reports structural classification differences as WARNING, not MATCH', () => {
    expect(resolveSemanticCompareStatus(['classificacao'], false).status).toBe('WARNING');
    expect(resolveSemanticCompareStatus([], false).status).toBe('MATCH');
  });

  it('keeps functional differences as ERROR when classification is structurally different', () => {
    expect(resolveSemanticCompareStatus(['classificacao', 'fases'], false).status).toBe('ERROR');
  });

  it('reports sporting standings divergences as ERROR', () => {
    expect(resolveSemanticCompareStatus(['classificacao'], true).status).toBe('ERROR');
  });

  it('compares old and new Libertadores row formats without false sporting divergences', () => {
    const baseline = { classificacao: { grupos: { 'GRUPO A': [oldRow] } } };
    const generated = { classificacao: { grupos: { 'GRUPO A': [newRow] } } };
    expect(diffLibertadoresClassification(baseline as any, generated.classificacao as any)).toEqual([]);
  });

  it('detects real points differences between old and new Libertadores row formats', () => {
    const baseline = { classificacao: { grupos: { 'GRUPO A': [oldRow] } } };
    const generated = {
      classificacao: { grupos: { 'GRUPO A': [['1', '', 'Time A', '9', '6', '3', '0', '3', '474,85', '28,00']] } },
    };
    const divergences = diffLibertadoresClassification(baseline as any, generated.classificacao as any);
    expect(divergences).toContainEqual({
      equipe: 'Time A',
      campo: 'pontos',
      valor_atual: 12,
      valor_calculado: 9,
    });
  });

  it('detects a baseline team missing from the generated classification', () => {
    const baseline = { classificacao: { grupos: { 'GRUPO A': [oldRow] } } };
    const generated = { classificacao: { grupos: { 'GRUPO A': [] } } };
    expect(diffLibertadoresClassification(baseline as any, generated.classificacao as any)).toContainEqual({
      equipe: 'Time A',
      campo: 'presenca',
      valor_atual: 'presente no cache',
      valor_calculado: null,
    });
  });

  it('counts Libertadores rows using its own column layout', () => {
    const baseline = {
      classificacao: { grupos: { 'GRUPO A': [oldRow] } },
      dados_externos: { rows: [] },
      fases: {},
    };
    const generated = {
      classificacao: { grupos: { 'GRUPO A': [newRow] } },
      dados_externos: { rows: [] },
      fases: {},
    };
    const report = buildCoverageReport({
      league: 'libertadores',
      baseline: baseline as any,
      generated: generated as any,
      matches: [],
      standings: {},
    });
    expect(report.standings_expected).toBe(1);
    expect(report.standings_generated).toBe(1);
  });

  it('keeps generic standings coverage for other tournaments', () => {
    const generated = {
      classificacao: { grupos: { 'GRUPO A': [newRow] } },
      dados_externos: { rows: [] },
      fases: {},
    };
    const report = buildCoverageReport({
      league: 'serie_a',
      baseline: null,
      generated: generated as any,
      matches: [],
      standings: { 'GRUPO A': [{ teamName: 'Time A' }] as any },
    });
    expect(report.standings_generated).toBe(1);
  });
});
