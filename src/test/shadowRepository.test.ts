import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createShadowRepository } from '../../supabase/functions/_shared/cache/shadowRepository';
import { mergeFasesPreservingScores } from '../../supabase/functions/_shared/cache/roundPreservation';
import { runPipeline } from '../../supabase/functions/_shared/sync/pipeline/index';
import { resolveDefinition } from '../../supabase/functions/_shared/tournament/registry';
import type { TournamentCachePayload } from '../../supabase/functions/_shared/tournament/types';

// ─────────────────────────────────────────────────────────────
// Fixtures: 4 times, 2 confrontos por rodada
// ─────────────────────────────────────────────────────────────
const TEAMS = [
  { id: '101', nome: 'Time A' },
  { id: '102', nome: 'Time B' },
  { id: '103', nome: 'Time C' },
  { id: '104', nome: 'Time D' },
];

const ROWS = TEAMS.map((t) => [t.nome, t.id, t.nome, t.id, '', '']);

function fase(r: number, scored: boolean) {
  return {
    tournament: 'Serie A',
    round: String(r),
    matches: [
      { team1: 'Time A', team2: 'Time B', score1: scored ? '50,00' : '', score2: scored ? '40,00' : '' },
      { team1: 'Time C', team2: 'Time D', score1: scored ? '30,00' : '', score2: scored ? '20,00' : '' },
    ],
  };
}

function shadowPayload(rounds: Record<number, boolean>): TournamentCachePayload {
  const fases: Record<string, unknown> = {};
  for (const [r, scored] of Object.entries(rounds)) fases[`rodada_${r}`] = fase(Number(r), scored);
  return {
    version: 1,
    synced_at: '2026-08-25T17:00:00.000Z',
    fases,
    classificacao: { grupos: { geral: [] } },
    dados_externos: { rows: ROWS },
    metadata: {
      provider: 'cartola_brasileirao',
      source_type: 'api',
      league: 'brasileirao_serie_a',
      season: 2026,
      schema_version: 1,
      hash: 'hash-anterior',
      generated_at: '2026-08-25T17:00:00.000Z',
    },
  } as TournamentCachePayload;
}

/** Planilha legada: fixtures completos, mas placares só até a R23. */
function legacyReader(scoredThrough: number) {
  return async (cacheKey: string) => {
    if (cacheKey === 'dados_externos:serie_a') return { rows: ROWS };
    if (cacheKey === 'classificacao:serie_a') return { data: [] };
    const m = cacheKey.match(/^resultados:serie_a:(\d+)$/);
    if (!m) return null;
    const r = Number(m[1]);
    if (r < 22 || r > 26) return null;
    return fase(r, r <= scoredThrough);
  };
}

const SHADOW_KEY = 'shadow/brasileirao_serie_a/2026';

/** Fake mínimo do `sheets_cache` usado pelo ShadowRepository. */
function fakeSupabase(store: Map<string, any>) {
  return {
    from(_table: string) {
      return {
        select() {
          return {
            eq(_col: string, value: string) {
              return {
                async maybeSingle() {
                  const data = store.get(value);
                  return { data: data ? { data } : null, error: null };
                },
              };
            },
          };
        },
        async upsert(row: any) {
          store.set(row.cache_key, row.data);
          return { error: null };
        },
      };
    },
  };
}

// API do Cartola: mercado aberto na rodada 26; pontuação só existe p/ R25.
function installFetchStub(rodadaAtual = 26, statusMercado = 1, scoredRound = 25) {
  const ok = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body, text: async () => '' }) as any;
  vi.stubGlobal('fetch', async (url: string) => {
    const u = String(url);
    if (u.endsWith('/mercado/status')) {
      return ok({ rodada_atual: rodadaAtual, status_mercado: statusMercado });
    }
    const score = u.match(/\/time\/id\/(\d+)\/(\d+)$/);
    if (score) {
      const [, id, rodada] = score;
      if (Number(rodada) !== scoredRound) return ok({ rodada_atual: scoredRound, pontos: null });
      return ok({ rodada_atual: Number(rodada), pontos: 10 + Number(id) % 10 });
    }
    const team = u.match(/\/time\/id\/(\d+)$/);
    if (team) {
      const t = TEAMS.find((x) => x.id === team[1])!;
      return ok({ time: { nome: t.nome, url_escudo_png: `escudo-${t.id}.png` } });
    }
    throw new Error(`URL não esperada no teste: ${u}`);
  });
}

async function syncWithShadow(store: Map<string, any>, scoredThrough = 23) {
  const { def, season } = resolveDefinition('brasileirao_serie_a');
  const repo = createShadowRepository({
    supabaseAdmin: fakeSupabase(store),
    league: def.league,
    season,
    legacyReader: legacyReader(scoredThrough),
  });
  const shadowDef = { ...def, cacheKey: () => SHADOW_KEY };
  return await runPipeline(shadowDef, season, { kind: 'all' }, repo, {
    persist: true,
    syncedBy: null,
    authMode: 'secret',
  });
}

function scoredCount(payload: any, r: number): number {
  const matches = payload?.fases?.[`rodada_${r}`]?.matches ?? [];
  return matches.filter((m: any) => String(m.score1 ?? '') !== '' && String(m.score2 ?? '') !== '')
    .length;
}

describe('mergeFasesPreservingScores', () => {
  it('rodada com placares nunca é substituída por versão vazia', () => {
    const merged = mergeFasesPreservingScores(
      { rodada_24: fase(24, false) },
      { rodada_24: fase(24, true) },
    );
    expect(scoredCount({ fases: merged }, 24)).toBe(2);

    const inverse = mergeFasesPreservingScores(
      { rodada_24: fase(24, true) },
      { rodada_24: fase(24, false) },
    );
    expect(scoredCount({ fases: inverse }, 24)).toBe(2);
  });

  it('acrescenta rodadas novas sem remover as antigas', () => {
    const merged = mergeFasesPreservingScores(
      { rodada_23: fase(23, true) },
      { rodada_25: fase(25, true) },
    );
    expect(Object.keys(merged).sort()).toEqual(['rodada_23', 'rodada_25']);
  });
});

describe('ShadowRepository — histórico cumulativo', () => {
  beforeEach(() => installFetchStub());
  afterEach(() => vi.unstubAllGlobals());

  it('T1 — preserva R22/R23/R24 ao sincronizar a R25', async () => {
    const store = new Map<string, any>([
      [SHADOW_KEY, shadowPayload({ 22: true, 23: true, 24: true, 25: false, 26: false })],
    ]);
    await syncWithShadow(store);
    const saved = store.get(SHADOW_KEY);
    expect(scoredCount(saved, 22)).toBe(2);
    expect(scoredCount(saved, 23)).toBe(2);
    expect(scoredCount(saved, 24)).toBe(2);
    expect(scoredCount(saved, 25)).toBe(2);
  });

  it('T2 — bug real: shadow R24 com placar + legado R24 vazio → R24 continua preenchida', async () => {
    const store = new Map<string, any>([
      [SHADOW_KEY, shadowPayload({ 22: true, 23: true, 24: true, 25: false, 26: false })],
    ]);
    // legado só tem placares até a R23 (exatamente o estado de produção)
    await syncWithShadow(store, 23);
    expect(scoredCount(store.get(SHADOW_KEY), 24)).toBe(2);
  });

  it('T3 — primeira criação: shadow inexistente usa o baseline legado', async () => {
    const store = new Map<string, any>();
    const result = await syncWithShadow(store, 23);
    const saved = store.get(SHADOW_KEY);
    expect(result.persisted).toBe(true);
    expect(saved).toBeTruthy();
    expect(scoredCount(saved, 23)).toBe(2);
    expect(scoredCount(saved, 25)).toBe(2);
  });

  it('T4 — nova rodada é adicionada sem destruir as anteriores', async () => {
    const store = new Map<string, any>([
      [SHADOW_KEY, shadowPayload({ 22: true, 23: true, 24: true })],
    ]);
    await syncWithShadow(store, 23);
    const saved = store.get(SHADOW_KEY);
    expect(Object.keys(saved.fases).sort()).toEqual(
      ['rodada_22', 'rodada_23', 'rodada_24', 'rodada_25', 'rodada_26'].sort(),
    );
    expect([22, 23, 24, 25].map((r) => scoredCount(saved, r))).toEqual([2, 2, 2, 2]);
  });

  it('T5 — mercado aberto (currentRound 26, status 1) continua consolidando a R25', async () => {
    const store = new Map<string, any>([
      [SHADOW_KEY, shadowPayload({ 24: true, 25: false, 26: false })],
    ]);
    await syncWithShadow(store, 23);
    const saved = store.get(SHADOW_KEY);
    expect(scoredCount(saved, 25)).toBe(2); // alvo = 26 - 1
    expect(scoredCount(saved, 26)).toBe(0); // rodada em curso segue sem placar
  });
});
