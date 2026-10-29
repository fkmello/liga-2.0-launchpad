import { describe, expect, it } from 'vitest';
import { resolveSemanticCompareStatus } from '../../supabase/functions/_shared/cache/compareStatus';
import { buildCoverageReport } from '../../supabase/functions/_shared/sync/validation/coverage';
import { diffLibertadoresClassification } from '../../supabase/functions/_shared/sync/validation/standingsDiff';
import { mergeCalculatedStandings, normalizeTournamentData } from '../../supabase/functions/_shared/sync/pipeline/normalize';
import { mergeTournamentPayload } from '../../supabase/functions/_shared/cache/payload';
import { createShadowRepository } from '../../supabase/functions/_shared/cache/shadowRepository';
import { mergeLibertadoresFasesPreservingScores } from '../../supabase/functions/_shared/cache/roundPreservation';
import { resolveLibertadoresProgression, updateLibertadoresFases } from '../../supabase/functions/_shared/providers/cartola-brasileirao/adapter-libertadores';

const oldRow = ['1', '', 'Time A', '12', '6', '4', '0', '2', '28,00'];
const newRow = ['1', '', 'Time A', '12', '6', '4', '0', '2', '474,85', '28,00'];

describe('pipeline validation indicators', () => {
  it('preserves manual Libertadores classification decisions through normalization', () => {
    const manualDecisions = {
      grupos: { 'GRUPO A': ['Time A', 'Time B'] },
      global: ['Time A', 'Time B'],
    };
    const adapter = {
      toClassificacao: () => ({
        grupos: { 'GRUPO A': [['1', '', 'Time A', '12']] },
        desempatesManuais: manualDecisions,
      }),
    } as any;

    const normalized = normalizeTournamentData([adapter], [{}], {} as any);

    expect(normalized.classificacao.grupos['GRUPO A']).toEqual([['1', '', 'Time A', '12']]);
    expect((normalized.classificacao as any).desempatesManuais).toEqual(manualDecisions);

    // Este é o passo do pipeline que aplica a classificação calculada; ele
    // deve substituir apenas os grupos e manter as decisões manuais.
    const classificationAfterStandings = mergeCalculatedStandings(
      normalized.classificacao,
      { 'GRUPO A': [['1', '', 'Time A', '12', '6', '4', '0', '2', '28,00']] },
    );
    expect(classificationAfterStandings.grupos['GRUPO A']).toEqual([
      ['1', '', 'Time A', '12', '6', '4', '0', '2', '28,00'],
    ]);
    expect((classificationAfterStandings as any).desempatesManuais).toEqual(manualDecisions);

    const previous = {
      version: 1,
      synced_at: '2026-01-01T00:00:00.000Z',
      fases: {},
      classificacao: {
        grupos: { 'GRUPO A': [['1', '', 'Time A', '12']] },
        desempatesManuais: manualDecisions,
      },
      dados_externos: { rows: [] },
    };
    const next = {
      ...previous,
      classificacao: classificationAfterStandings,
    };
    const merged = mergeTournamentPayload({ mergeableKeys: [] } as any, previous as any, next as any);

    expect((merged.classificacao as any).desempatesManuais).toEqual(manualDecisions);
  });
  it('persists manual decisions only in the isolated shadow cache and reloads them', async () => {
    const rows = new Map<string, any>();
    const upsertedKeys: string[] = [];
    const supabaseAdmin = {
      from(table: string) {
        if (table !== 'sheets_cache') throw new Error(`Unexpected table: ${table}`);
        let selectedKey = '';
        return {
          select() { return this; },
          eq(column: string, value: string) {
            if (column !== 'cache_key') throw new Error(`Unexpected column: ${column}`);
            selectedKey = value;
            return this;
          },
          async maybeSingle() {
            const row = rows.get(selectedKey);
            return { data: row ? { data: row.data } : null, error: null };
          },
          async upsert(row: any, options: any) {
            expect(options).toEqual({ onConflict: 'cache_key' });
            upsertedKeys.push(row.cache_key);
            rows.set(row.cache_key, row);
            return { error: null };
          },
        };
      },
    };
    const manualDecisions = {
      grupos: { 'GRUPO A': ['Time A', 'Time B'] },
      global: ['Time A', 'Time B'],
    };
    const payload = {
      version: 1,
      synced_at: '2026-10-27T21:00:00.000Z',
      fases: { Semifinal: { matches: [{ team1: 'Time A', team2: 'Time B' }] } },
      classificacao: {
        grupos: { 'GRUPO A': [['1', '', 'Time A', '12']] },
        desempatesManuais: manualDecisions,
      },
      dados_externos: { rows: [] },
      metadata: { hash: 'test-hash' },
    } as any;
    const repo = createShadowRepository({
      supabaseAdmin,
      league: 'libertadores',
      season: 2026,
      legacyReader: async () => null,
    });

    const saved = await repo.save('libertadores', payload, { type: 'libertadores', syncedBy: null });

    expect(saved).toEqual({ changed: true });
    expect(repo.shadowKey).toBe('shadow/libertadores/2026');
    expect(upsertedKeys).toEqual(['shadow/libertadores/2026']);
    expect(rows.has('libertadores')).toBe(false);
    expect(rows.get('shadow/libertadores/2026').type).toBe('shadow_libertadores');
    expect(rows.get('shadow/libertadores/2026').data.classificacao.desempatesManuais).toEqual(manualDecisions);
    expect((await repo.load('libertadores'))?.classificacao.desempatesManuais).toEqual(manualDecisions);
  });

  it('keeps a manual knockout winner through a simulated API sync and shadow-cache reload', async () => {
    const rows = new Map<string, any>();
    const supabaseAdmin = {
      from(table: string) {
        if (table !== 'sheets_cache') throw new Error(`Unexpected table: ${table}`);
        let selectedKey = '';
        return {
          select() { return this; },
          eq(column: string, value: string) {
            if (column !== 'cache_key') throw new Error(`Unexpected column: ${column}`);
            selectedKey = value;
            return this;
          },
          async maybeSingle() {
            const row = rows.get(selectedKey);
            return { data: row ? { data: row.data } : null, error: null };
          },
          async upsert(row: any) {
            rows.set(row.cache_key, row);
            return { error: null };
          },
        };
      },
    };
    const phases: any = {
      'Oitavas de Final': { matches: Array.from({ length: 8 }, (_, i) => ({
        matchNumber: String(i + 1),
        team1: `Time A${i}`,
        team2: `Time B${i}`,
        scoreIda1: i === 0 ? '80,00' : '90,00',
        scoreIda2: i === 0 ? '80,00' : '70,00',
        scoreVolta1: i === 0 ? '70,00' : '90,00',
        scoreVolta2: i === 0 ? '70,00' : '70,00',
        ...(i === 0 ? { manualWinner: 'Time B0' } : {}),
      })) },
      'Quartas de Final': { matches: Array.from({ length: 4 }, (_, i) => ({ matchNumber: String(i + 1), team1: '', team2: '' })) },
      Semifinal: { matches: Array.from({ length: 2 }, (_, i) => ({ matchNumber: String(i + 1), team1: '', team2: '' })) },
      Final: { matches: [{ matchNumber: 'FINAL', team1: '', team2: '' }, { matchNumber: '3º LUGAR', team1: '', team2: '' }] },
    };
    const repo = createShadowRepository({
      supabaseAdmin,
      league: 'libertadores',
      season: 2026,
      legacyReader: async () => null,
    });
    const initial = {
      version: 1,
      synced_at: '2026-10-27T21:00:00.000Z',
      fases: phases,
      classificacao: { grupos: { 'GRUPO A': [['1', '', 'Time A0', '12']] }, desempatesManuais: { grupos: {}, global: [] } },
      dados_externos: { rows: [['Time A0', '1', '']] },
      metadata: { hash: 'before-sync' },
    } as any;
    await repo.save('libertadores', initial, { type: 'libertadores', syncedBy: null });

    // Simula a próxima sincronização da API: ela não envia manualWinner.
    const loaded = await repo.load('libertadores');
    expect((loaded?.fases['Oitavas de Final'] as any)?.matches[0].manualWinner).toBe('Time B0');
    const apiFases = updateLibertadoresFases(
      loaded!.fases as any,
      24,
      new Map<string, number | null>(),
      new Map<string, string>(),
    );
    const progressed = resolveLibertadoresProgression(apiFases, loaded!.classificacao as any);
    const mergedFases = mergeLibertadoresFasesPreservingScores(loaded!.fases, progressed);

    await repo.save('libertadores', {
      ...loaded!,
      synced_at: '2026-10-27T21:01:00.000Z',
      fases: mergedFases,
      metadata: { ...loaded!.metadata!, hash: 'after-sync' },
    }, { type: 'libertadores', syncedBy: null });

    const reloaded = await repo.load('libertadores');
    expect((reloaded?.fases['Oitavas de Final'] as any)?.matches[0].manualWinner).toBe('Time B0');
    expect((reloaded?.fases['Quartas de Final'] as any)?.matches[0].team1).toBe('Time B0');
    expect((reloaded?.fases['Quartas de Final'] as any)?.matches[0].team2).toBe('Time A1');
    expect([...rows.keys()]).toEqual(['shadow/libertadores/2026']);
  });

  it('persists the Libertadores semifinal matchups after quarterfinal winners are resolved', async () => {
    const rows = new Map<string, any>();

    const supabaseAdmin = {
      from(table: string) {
        if (table !== 'sheets_cache') {
          throw new Error(`Unexpected table: ${table}`);
        }

        let selectedKey = '';

        return {
          select() {
            return this;
          },
          eq(column: string, value: string) {
            if (column !== 'cache_key') {
              throw new Error(`Unexpected column: ${column}`);
            }
            selectedKey = value;
            return this;
          },
          async maybeSingle() {
            const row = rows.get(selectedKey);
            return {
              data: row ? { data: row.data } : null,
              error: null,
            };
          },
          async upsert(row: any) {
            rows.set(row.cache_key, row);
            return { error: null };
          },
        };
      },
    };

    const phases: any = {
      'Quartas de Final': {
        matches: [
          {
            matchNumber: 'QF1',
            team1: 'Time Azul',
            team2: 'Time Verde',
            scoreIda1: '1',
            scoreIda2: '0',
            scoreVolta1: '0',
            scoreVolta2: '1',
            manualWinner: 'Time Verde',
            manualPenaltyScore1: '3',
            manualPenaltyScore2: '4',
          },
          {
            matchNumber: 'QF2',
            team1: 'Time Amarelo',
            team2: 'Time Roxo',
            scoreIda1: '2',
            scoreIda2: '0',
            scoreVolta1: '1',
            scoreVolta2: '1',
          },
          {
            matchNumber: 'QF3',
            team1: 'Time Branco',
            team2: 'Time Preto',
            scoreIda1: '0',
            scoreIda2: '1',
            scoreVolta1: '2',
            scoreVolta2: '0',
          },
          {
            matchNumber: 'QF4',
            team1: 'Time Laranja',
            team2: 'Time Rosa',
            scoreIda1: '1',
            scoreIda2: '1',
            scoreVolta1: '0',
            scoreVolta2: '2',
          },
        ],
      },
      Semifinal: {
        matches: [
          { matchNumber: 'SF1', team1: '', team2: '' },
          { matchNumber: 'SF2', team1: '', team2: '' },
        ],
      },
    };

    const repo = createShadowRepository({
      supabaseAdmin,
      league: 'libertadores',
      season: 2026,
      legacyReader: async () => null,
    });

    const payload: any = {
      version: 1,
      synced_at: '2026-10-28T00:00:00.000Z',
      fases: phases,
      classificacao: {
        grupos: {},
        desempatesManuais: { grupos: {}, global: [] },
      },
      dados_externos: { rows: [] },
      metadata: { hash: 'quarterfinals-test' },
    };

    await repo.save('libertadores', payload, {
      type: 'libertadores',
      syncedBy: null,
    });

    const loaded = await repo.load('libertadores');
    expect(loaded).not.toBeNull();

    const progressed = resolveLibertadoresProgression(
      loaded!.fases as any,
      loaded!.classificacao as any,
    );

    expect(
      (progressed as any).Semifinal.matches.map(
        (match: any) => [match.team1, match.team2],
      ),
    ).toEqual([
      ['Time Verde', 'Time Amarelo'],
      ['Time Branco', 'Time Rosa'],
    ]);

    await repo.save(
      'libertadores',
      {
        ...loaded!,
        fases: progressed,
        metadata: {
          ...loaded!.metadata!,
          hash: 'semifinals-progressed-test',
        },
      },
      { type: 'libertadores', syncedBy: null },
    );

    const reloaded = await repo.load('libertadores');
    const semis = (reloaded!.fases as any).Semifinal.matches;

    expect(semis).toHaveLength(2);
    expect([semis[0].team1, semis[0].team2]).toEqual([
      'Time Verde',
      'Time Amarelo',
    ]);
    expect([semis[1].team1, semis[1].team2]).toEqual([
      'Time Branco',
      'Time Rosa',
    ]);

    const quarterfinals = (reloaded!.fases as any)['Quartas de Final'].matches;

    expect(quarterfinals[0].manualWinner).toBe('Time Verde');
    expect(quarterfinals[0].manualPenaltyScore1).toBe('3');
    expect(quarterfinals[0].manualPenaltyScore2).toBe('4');

    expect([...rows.keys()]).toEqual(['shadow/libertadores/2026']);
  });

  it('does not restore obsolete scored fixtures when Libertadores knockout pairings change', () => {
    const previous = {
      'Oitavas de Final': {
        matches: [{
          matchNumber: 'R16-1',
          team1: 'Time Antigo A',
          team2: 'Time Antigo B',
          scoreIda1: '2',
          scoreIda2: '0',
          scoreVolta1: '1',
          scoreVolta2: '0',
        }],
      },
    };
    const next = {
      'Oitavas de Final': {
        matches: [{
          matchNumber: 'R16-1',
          team1: 'Time Novo A',
          team2: 'Time Novo B',
          scoreIda1: '',
          scoreIda2: '',
          scoreVolta1: '',
          scoreVolta2: '',
        }],
      },
    };

    const merged = mergeLibertadoresFasesPreservingScores(previous, next) as any;
    expect(merged['Oitavas de Final'].matches).toHaveLength(1);
    expect(merged['Oitavas de Final'].matches[0]).toMatchObject({
      team1: 'Time Novo A',
      team2: 'Time Novo B',
      scoreIda1: '',
      scoreIda2: '',
      scoreVolta1: '',
      scoreVolta2: '',
    });
  });

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
