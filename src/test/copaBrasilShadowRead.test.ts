import { describe, expect, it } from 'vitest';
import { getCopaBrasilBaseDataQueryKey, getCopaBrasilShadowPhase, getCopaBrasilShadowRows } from '@/lib/copaBrasilShadow';

describe('Copa do Brasil shadow read contract', () => {
  const payload = {
    version: 1,
    fases: {
      '1ª Fase': {
        fase: '1ª Fase',
        matches: [{ team1: 'Time A', team2: 'Time B', scoreIda1: '10', scoreIda2: '20' }],
      },
    },
    dados_externos: {
      rows: [['Time A', '101', 'https://example.test/a.png']],
    },
  };

  it('uses one shared query key for team badges regardless of selected phase', () => {
    expect(getCopaBrasilBaseDataQueryKey(false)).toEqual(['base-dados-copa', false]);
    expect(getCopaBrasilBaseDataQueryKey(true)).toEqual(['base-dados-copa', true]);
  });

  it('extracts normalized team rows for badges and team ID mapping', () => {
    expect(getCopaBrasilShadowRows(payload)).toEqual(payload.dados_externos.rows);
  });

  it('extracts a phase only when its matches array exists', () => {
    expect(getCopaBrasilShadowPhase(payload, '1ª Fase')).toEqual(payload.fases['1ª Fase']);
    expect(getCopaBrasilShadowPhase(payload, 'Final')).toBeNull();
  });

  it('rejects missing or malformed team rows so callers can fall back to legacy', () => {
    expect(getCopaBrasilShadowRows(null)).toBeNull();
    expect(getCopaBrasilShadowRows({ dados_externos: { rows: [] } })).toBeNull();
    expect(getCopaBrasilShadowRows({ dados_externos: { rows: 'invalid' } })).toBeNull();
  });

  it('rejects missing or malformed phase data so callers can fall back to legacy', () => {
    expect(getCopaBrasilShadowPhase(null, '1ª Fase')).toBeNull();
    expect(getCopaBrasilShadowPhase({ fases: { '1ª Fase': { matches: null } } }, '1ª Fase')).toBeNull();
  });
});
