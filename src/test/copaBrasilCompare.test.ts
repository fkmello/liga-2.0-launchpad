import { describe, expect, it } from 'vitest';
import { diffPayloads } from '../../supabase/functions/_shared/cache/diff';

const legacyPayload = {
  version: 0,
  synced_at: '',
  fases: {},
  classificacao: { grupos: {} },
  dados_externos: {
    headers: ['', 'ID'],
    raw: [
      ['', 'ID'],
      ['Time A', '101', 'https://legacy.example/badge-a'],
      ['Time B', '102', 'https://legacy.example/badge-b'],
    ],
  },
} as any;

const apiPayload = {
  version: 1,
  synced_at: '',
  fases: {},
  classificacao: { grupos: {} },
  dados_externos: {
    rows: [
      ['Time A', '101', 'https://api.example/badge-a'],
      ['Time B', '102', 'https://api.example/badge-b'],
    ],
  },
} as any;

describe('Copa do Brasil semantic comparison', () => {
  it('treats legacy raw and normalized rows as equivalent when team names and IDs match', () => {
    const result = diffPayloads(legacyPayload, apiPayload, {
      league: 'copa_brasil',
      semantic: true,
    });

    expect(result.changed).toBe(false);
    expect(result.diff).toEqual({});
  });

  it('still reports a difference when a team ID or name changes', () => {
    const changed = {
      ...apiPayload,
      dados_externos: {
        rows: [
          ['Time A', '101', 'https://api.example/badge-a'],
          ['Time B Renomeado', '102', 'https://api.example/badge-b'],
        ],
      },
    };

    const result = diffPayloads(legacyPayload, changed, {
      league: 'copa_brasil',
      semantic: true,
    });

    expect(result.changed).toBe(true);
    expect(result.diff).toHaveProperty('dados_externos');
  });

  it('keeps strict comparison for other leagues', () => {
    const result = diffPayloads(legacyPayload, apiPayload, {
      league: 'brasileirao_serie_a',
      semantic: true,
    });

    expect(result.changed).toBe(true);
    expect(result.diff).toHaveProperty('dados_externos');
  });

  it('keeps strict comparison outside compare/audit mode', () => {
    const result = diffPayloads(legacyPayload, apiPayload, {
      league: 'copa_brasil',
      semantic: false,
    });

    expect(result.changed).toBe(true);
    expect(result.diff).toHaveProperty('dados_externos');
  });
});
