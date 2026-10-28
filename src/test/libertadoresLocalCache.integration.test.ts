
import { describe, expect, it } from 'vitest';
import { createShadowRepository } from '../../supabase/functions/_shared/cache/shadowRepository';
import { resolveLibertadoresProgression } from '../../supabase/functions/_shared/providers/cartola-brasileirao/adapter-libertadores';

describe('Libertadores — progressão e persistência offline', () => {
  it('calcula, salva e recarrega as semifinais preservando os pênaltis', async () => {
    const rows = new Map<string, any>();

    const supabaseAdmin = {
      from(table: string) {
        if (table !== 'sheets_cache') {
          throw new Error(`Tabela inesperada: ${table}`);
        }

        let selectedKey = '';

        return {
          select() {
            return this;
          },
          eq(column: string, value: string) {
            if (column !== 'cache_key') {
              throw new Error(`Coluna inesperada: ${column}`);
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
            rows.set(row.cache_key, structuredClone(row));
            return { error: null };
          },
        };
      },
    };

    const fases: any = {
      'Quartas de Final': {
        fase: 'Quartas de Final',
        rodadaInfo: 'TESTE LOCAL - DADOS FICTÍCIOS',
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
            manualPenaltyScore1: 3,
            manualPenaltyScore2: 4,
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
        fase: 'Semifinal',
        rodadaInfo: 'TESTE LOCAL - DADOS FICTÍCIOS',
        matches: [
          {
            matchNumber: 'SF1',
            team1: '',
            team2: '',
            scoreIda1: '',
            scoreIda2: '',
            scoreVolta1: '',
            scoreVolta2: '',
          },
          {
            matchNumber: 'SF2',
            team1: '',
            team2: '',
            scoreIda1: '',
            scoreIda2: '',
            scoreVolta1: '',
            scoreVolta2: '',
          },
        ],
      },
    };

    const repo = createShadowRepository({
      supabaseAdmin: supabaseAdmin as any,
      league: 'libertadores',
      season: 2026,
      legacyReader: async () => null,
    });

    const payload: any = {
      version: 1,
      synced_at: '2026-10-28T00:00:00.000Z',
      fases,
      classificacao: { grupos: {} },
      dados_externos: { rows: [] },
      metadata: { hash: 'offline-progression-test' },
    };

    // Simula o carregamento e a persistência inicial do cache.
    await repo.save('libertadores', payload, {
      type: 'libertadores',
      syncedBy: null,
    });

    const loaded = await repo.load('libertadores');
    expect(loaded).toBeTruthy();

    // Executa a mesma função de progressão usada pelo adaptador.
    const progressed = resolveLibertadoresProgression(
      loaded!.fases as any,
      loaded!.classificacao as any,
    );

    expect(
      progressed.Semifinal.matches.map((match: any) => [
        match.team1,
        match.team2,
      ]),
    ).toEqual([
      ['Time Verde', 'Time Amarelo'],
      ['Time Branco', 'Time Rosa'],
    ]);

    expect(progressed['Quartas de Final'].matches[0]).toMatchObject({
      manualWinner: 'Time Verde',
      manualPenaltyScore1: 3,
      manualPenaltyScore2: 4,
    });

    // Simula salvar o payload calculado e recarregá-lo.
    await repo.save(
      'libertadores',
      {
        ...loaded!,
        synced_at: '2026-10-28T00:01:00.000Z',
        fases: progressed,
        metadata: { hash: 'offline-progression-result' },
      },
      {
        type: 'libertadores',
        syncedBy: null,
      },
    );

    const reloaded = await repo.load('libertadores');

    expect(
      reloaded!.fases.Semifinal.matches.map((match: any) => [
        match.team1,
        match.team2,
      ]),
    ).toEqual([
      ['Time Verde', 'Time Amarelo'],
      ['Time Branco', 'Time Rosa'],
    ]);

    expect(reloaded!.fases['Quartas de Final'].matches[0]).toMatchObject({
      manualWinner: 'Time Verde',
      manualPenaltyScore1: 3,
      manualPenaltyScore2: 4,
    });

    expect([...rows.keys()]).toEqual(['shadow/libertadores/2026']);
  });
});
