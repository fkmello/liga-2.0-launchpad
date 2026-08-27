import { describe, it, expect } from 'vitest';
import { calculateStandings } from '../../supabase/functions/_shared/standings/engine';
import { resolvePreset, STANDINGS_PRESETS } from '../../supabase/functions/_shared/standings/presets';
import { selectAdapters, resolveDefinition } from '../../supabase/functions/_shared/tournament/registry';
import {
  buildTournamentPayload,
  mergeTournamentPayload,
  validateTournamentPayload,
} from '../../supabase/functions/_shared/cache/payload';
import { hashPayloadContent, stableStringify } from '../../supabase/functions/_shared/cache/hash';
import { createInMemoryCacheRepository } from '../../supabase/functions/_shared/cache/sheetsCacheRepository';
import { normalizeTournamentData } from '../../supabase/functions/_shared/sync/pipeline/normalize';
import type { MatchInput } from '../../supabase/functions/_shared/standings/types';
import type { TournamentAdapter, AdapterContext } from '../../supabase/functions/_shared/tournament/types';

const m = (
  group: string,
  homeId: string,
  awayId: string,
  hg: number | null,
  ag: number | null,
): MatchInput => ({ group, homeId, awayId, homeName: homeId, awayName: awayId, homeGoals: hg, awayGoals: ag });

describe('StandingsEngine', () => {
  it('conta pontos, saldo e agrupa', () => {
    const table = calculateStandings([m('A', 'x', 'y', 2, 1), m('A', 'y', 'x', 0, 0)], resolvePreset('FIFA'));
    expect(Object.keys(table)).toEqual(['A']);
    expect(table.A[0].teamId).toBe('x');
    expect(table.A[0].points).toBe(4);
    expect(table.A[0].goalDiff).toBe(1);
    expect(table.A[1].points).toBe(1);
  });

  it('ignora confrontos sem placar', () => {
    const table = calculateStandings([m('A', 'x', 'y', null, null)], resolvePreset('FIFA'));
    expect(table.A[0].played).toBe(0);
  });

  it('preset FIFA desempata por vitórias antes do saldo', () => {
    expect(STANDINGS_PRESETS.FIFA.tiebreakers).toEqual(['points', 'wins', 'goalDiff', 'goalsFor']);
    const table = calculateStandings(
      [m('A', 'a', 'c', 1, 0), m('A', 'b', 'c', 3, 1), m('A', 'a', 'd', 0, 0), m('A', 'b', 'd', 0, 1)],
      resolvePreset('FIFA'),
    );
    // a: 4 pts 1 vitória | b: 3 pts 1 vitória — pontos primeiro
    expect(table.A[0].teamId).toBe('a');
  });

  it('preset UEFA prioriza saldo sobre vitórias', () => {
    expect(STANDINGS_PRESETS.UEFA.tiebreakers[1]).toBe('goalDiff');
  });

  it('desempate por confronto direto', () => {
    const table = calculateStandings([m('A', 'x', 'y', 1, 0), m('A', 'y', 'x', 0, 1)], {
      tiebreakers: ['points', 'headToHead'],
      groupBy: true,
    });
    expect(table.A[0].teamId).toBe('x');
  });

  it('é genérica: nenhuma referência a torneio', () => {
    const table = calculateStandings([m('', 'x', 'y', 1, 0)], { tiebreakers: ['points'] });
    expect(table['']).toHaveLength(2);
  });
});

describe('Registry', () => {
  it('resolve definição e temporada padrão', () => {
    const { def, season } = resolveDefinition('copa_mundo');
    expect(season).toBe(2026);
    expect(def.activeSync).toBe('api');
    expect(def.persistMode).toBe('shadow');

  });

  it('cacheKey mantém a chave atual na temporada corrente', () => {
    const { def } = resolveDefinition('copa_mundo');
    expect(def.cacheKey(2026)).toBe('copa_mundo');
    expect(def.cacheKey(2027)).toBe('copa_mundo:2027');
  });

  it('feature flag activeSync governa a seleção de adapters', () => {
    const { def } = resolveDefinition('copa_mundo');
    expect(selectAdapters({ ...def, activeSync: 'sheet' })).toHaveLength(0);
    expect(selectAdapters({ ...def, activeSync: 'api' }).map((a) => a.id)).toEqual(['cartola_copa_v1']);
    expect(selectAdapters({ ...def, activeSync: 'hybrid' })).toHaveLength(1);
  });

  it('rejeita torneio não registrado', () => {
    expect(() => resolveDefinition('inexistente')).toThrow();
  });
});

describe('Payload e cache', () => {
  const { def } = resolveDefinition('copa_mundo');
  const data = {
    fases: { fase_grupos: { rodada_1: { matches: [] } } },
    classificacao: { grupos: { A: [] } },
    dados_externos: { rows: [['Brasil', '1', 'url']] },
  };

  it('metadata fica isolado e o payload funcional inalterado', async () => {
    const payload = await buildTournamentPayload(def, 2026, data, {
      provider: 'cartola_copa',
      source_type: 'api',
    });
    expect(Object.keys(payload).sort()).toEqual(
      ['classificacao', 'dados_externos', 'fases', 'metadata', 'synced_at', 'version'].sort(),
    );
    expect(payload.metadata?.provider).toBe('cartola_copa');
    expect(payload.metadata?.season).toBe(2026);
    expect(payload.metadata?.schema_version).toBe(1);
  });

  it('hash é estável e ignora synced_at', async () => {
    const a = await hashPayloadContent(data);
    const b = await hashPayloadContent({ ...data, fases: { ...data.fases } });
    expect(a).toBe(b);
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it('merge preserva rodadas anteriores da fase de grupos', async () => {
    const prev = await buildTournamentPayload(
      def,
      2026,
      { ...data, fases: { fase_grupos: { rodada_1: { x: 1 } } } },
      { provider: 'google_sheets', source_type: 'sheet' },
    );
    const next = await buildTournamentPayload(
      def,
      2026,
      { ...data, fases: { fase_grupos: { rodada_2: { x: 2 } } } },
      { provider: 'cartola_copa', source_type: 'api' },
    );
    const merged = mergeTournamentPayload(def, prev, next);
    expect(Object.keys((merged.fases as any).fase_grupos).sort()).toEqual(['rodada_1', 'rodada_2']);
  });

  it('validate rejeita payload vazio', () => {
    const empty = {
      version: def.version,
      synced_at: '',
      fases: {},
      classificacao: { grupos: {} },
      dados_externos: { rows: [] },
    };
    expect(validateTournamentPayload(empty, def).valid).toBe(false);
  });

  it('repositório não regrava quando o hash não muda', async () => {
    const repo = createInMemoryCacheRepository();
    const payload = await buildTournamentPayload(def, 2026, data, {
      provider: 'cartola_copa',
      source_type: 'api',
    });
    expect((await repo.save('copa_mundo', payload, { type: 'copa_mundo', syncedBy: 'test' })).changed).toBe(true);
    expect((await repo.save('copa_mundo', payload, { type: 'copa_mundo', syncedBy: 'test' })).changed).toBe(false);
  });
});

describe('normalizeTournamentData', () => {
  const ctx = { league: 'x', season: 2026, scope: { kind: 'all' }, fetchJson: async () => ({}) } as unknown as AdapterContext;

  const adapter = (id: string, rows: unknown[]): TournamentAdapter<unknown> => ({
    id,
    provider: id,
    source_type: 'api',
    fetchRaw: async () => ({}),
    toDadosExternos: () => ({ rows }),
  });

  it('combina múltiplas fontes com precedência do primeiro adapter', () => {
    const out = normalizeTournamentData(
      [adapter('a', ['A']), adapter('b', ['B'])],
      [{}, {}],
      ctx,
    );
    expect(out.dados_externos.rows).toEqual(['A']);
  });
});
