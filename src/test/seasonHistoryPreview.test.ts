import { describe, expect, it } from 'vitest';
import { buildSeasonHistoryPreview, parseCartolaNumber, type CacheSnapshot } from '../lib/seasonHistoryPreview';

describe('season history preview collector', () => {
  it('parses Cartola localized decimal values', () => {
    expect(parseCartolaNumber('2.943,09')).toBe(2943.09);
    expect(parseCartolaNumber('81,5')).toBe(81.5);
    expect(parseCartolaNumber('')).toBeNull();
  });

  it('normalizes the complete annual ranking without imposing a fixed team limit', () => {
    const rows = Array.from({ length: 63 }, (_, index) => ({
      position: String(index + 1),
      teamName: `Equipe ${index + 1}`,
      badge: '',
      total: '1.234,56',
    }));
    const preview = buildSeasonHistoryPreview(2026, [{
      cache_key: 'ranking_liga:ANUAL',
      type: 'classificacao',
      synced_at: '2026-10-31T12:00:00Z',
      data: { rankings: rows },
    }]);
    expect(preview.standings).toHaveLength(63);
    expect(preview.standings[0].totalPoints).toBe(1234.56);
    expect(preview.standings[62].position).toBe(63);
  });

  it('resolves a two-leg final and third-place match, preserving manual decisions', () => {
    const snapshot: CacheSnapshot = {
      cache_key: 'shadow/libertadores/2026',
      type: 'shadow_libertadores',
      synced_at: '2026-10-31T12:00:00Z',
      data: {
        metadata: { provider: 'cartola_brasileirao', source_type: 'api' },
        dados_externos: { rows: [
          ['Equipe A', '1', '', 'https://example.com/a.png'],
          ['Equipe B', '2', '', 'https://example.com/b.png'],
          ['Equipe C', '3', '', 'https://example.com/c.png'],
          ['Equipe D', '4', '', 'https://example.com/d.png'],
        ] },
        fases: { Final: { matches: [
          { tipo: 'final', team1: 'Equipe A', team2: 'Equipe B', scoreIda1: '80,00', scoreIda2: '70,00', scoreVolta1: '60,00', scoreVolta2: '75,00' },
          { tipo: 'terceiro_lugar', team1: 'Equipe C', team2: 'Equipe D', scoreIda1: '50,00', scoreIda2: '50,00', manualWinner: 'Equipe D' },
        ] } },
      },
    };
    const preview = buildSeasonHistoryPreview(2026, [snapshot, {
      cache_key: 'ranking_liga:ANUAL', type: 'classificacao', synced_at: '2026-10-31T12:00:00Z',
      data: { rankings: [{ position: '1', teamName: 'Equipe A', badge: '', total: '100,00' }] },
    }]);
    const liberta = preview.tournaments.find(item => item.slug === 'libertadores')!;
    expect(liberta.status).toBe('complete');
    expect(liberta.podium.map(item => item.teamName)).toEqual(['Equipe A', 'Equipe B', 'Equipe D']);
    expect(liberta.podium[0].badgeUrl).toBe('https://example.com/a.png');
    expect(liberta.podium[2].decidedManually).toBe(true);
    expect(preview.standings[0].cartolaTeamId).toBe('1');
  });

  it('does not infer a winner from an unresolved aggregate tie', () => {
    const preview = buildSeasonHistoryPreview(2026, [{
      cache_key: 'campeoes',
      type: 'campeoes',
      synced_at: null,
      data: { fases: { Final: { matches: [
        { tipo: 'final', team1: 'Equipe A', team2: 'Equipe B', scoreIda1: '70,00', scoreIda2: '60,00', scoreVolta1: '60,00', scoreVolta2: '70,00' },
      ] } } },
    }]);
    const champions = preview.tournaments.find(item => item.slug === 'champions-league')!;
    expect(champions.status).toBe('pending');
    expect(champions.podium).toHaveLength(0);
    expect(champions.warnings.some(warning => warning.includes('não possui resultado decisivo'))).toBe(true);
  });
});
