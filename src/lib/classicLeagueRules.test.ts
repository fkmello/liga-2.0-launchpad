import { describe, expect, it } from 'vitest';
import {
  CLASSIC_LEAGUE_EXPECTED_TEAMS,
  parseClassicLeagueRoster,
  resolveClassicLeagueCompletedRound,
} from '../../../supabase/functions/_shared/classicLeagueRules';

const rosterRows = () => Array.from({ length: CLASSIC_LEAGUE_EXPECTED_TEAMS }, (_, index) => [
  index + 1, '', `Time ${index + 1}`, String(1000 + index), '', `https://badge/${index}.svg`,
]);

describe('resolveClassicLeagueCompletedRound', () => {
  it.each([
    [{ status_mercado: 1, rodada_atual: 2 }, 1],
    [{ status_mercado: 1, rodada_atual: 35 }, 34],
    [{ status_mercado: 1, rodada_atual: 38 }, 37],
    [{ status_mercado: 6, rodada_atual: 38 }, 38],
  ])('resolve %j as round %i', (market, expected) => {
    expect(resolveClassicLeagueCompletedRound(market)).toBe(expected);
  });

  it.each([
    [{ status_mercado: 1, rodada_atual: 1 }, /Ainda não existe/],
    [{ status_mercado: 2, rodada_atual: 35 }, /Mercado fechado/],
    [{ status_mercado: 4, rodada_atual: 35 }, /manutenção/],
    [{ status_mercado: 6, rodada_atual: 37 }, /sem confirmação/],
    [{ status_mercado: 99, rodada_atual: 35 }, /não elegível/],
    [{ status_mercado: 1, rodada_atual: 39 }, /inválida/],
    [{ status_mercado: 1, rodada_atual: 0 }, /inválida/],
  ])('blocks unsafe market state %j', (market, message) => {
    expect(() => resolveClassicLeagueCompletedRound(market)).toThrow(message);
  });
});

describe('parseClassicLeagueRoster', () => {
  it('parses exactly 60 valid unique Cartola teams', () => {
    const teams = parseClassicLeagueRoster({ raw: rosterRows() });
    expect(teams).toHaveLength(60);
    expect(teams[0]).toEqual({
      id: '1000',
      name: 'Time 1',
      badge: 'https://badge/0.svg',
    });
  });

  it('rejects a roster with fewer than 60 valid teams', () => {
    expect(() => parseClassicLeagueRoster({ raw: rosterRows().slice(0, 59) })).toThrow(/esperados 60/);
  });

  it('rejects duplicate Cartola IDs', () => {
    const rows = rosterRows();
    rows[59][3] = rows[0][3];
    expect(() => parseClassicLeagueRoster({ raw: rows })).toThrow(/IDs únicos/);
  });

  it('rejects missing or malformed raw data', () => {
    expect(() => parseClassicLeagueRoster(null)).toThrow(/campo raw válido/);
    expect(() => parseClassicLeagueRoster({ raw: 'not-an-array' })).toThrow(/campo raw válido/);
  });

  it('ignores malformed rows but still requires 60 valid entries', () => {
    const rows = rosterRows();
    rows[0] = ['', '', 'Sem ID', '', '', ''];
    expect(() => parseClassicLeagueRoster({ raw: rows })).toThrow(/esperados 60/);
  });
});
