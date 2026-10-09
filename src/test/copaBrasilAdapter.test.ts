import { describe, expect, it } from 'vitest';
import { cartolaCopaBrasilAdapter, updateCopaBrasilFases } from '../../supabase/functions/_shared/providers/cartola-brasileirao/adapter-copa-brasil';
import { resolveDefinition, selectAdapters } from '../../supabase/functions/_shared/tournament/registry';
import { readLegacyTournament } from '../../supabase/functions/_shared/cache/legacy/reader';

const initialFases = {
  '1ª Fase': {
    fase: '1ª Fase',
    rodadaInfo: 'Ida - Rodada 5 | Volta - Rodada 7',
    matches: [{
      team1: 'Time A',
      team2: 'Time B',
      matchNumber: '1',
      scoreIda1: '50,00',
      scoreIda2: '40,00',
      scoreVolta1: '35,00',
      scoreVolta2: '30,00',
    }],
  },
};

const idByName = new Map([
  ['timea', '101'],
  ['timeb', '102'],
]);

describe('Copa do Brasil adapter', () => {
  it('atualiza somente a ida quando a rodada-alvo é 5', () => {
    const result = updateCopaBrasilFases(
      initialFases,
      5,
      new Map([['101', 77.25], ['102', 66.5]]),
      idByName,
    );
    const match = result['1ª Fase'].matches[0];
    expect(match.scoreIda1).toBe('77,25');
    expect(match.scoreIda2).toBe('66,50');
    expect(match.scoreVolta1).toBe('35,00');
    expect(match.scoreVolta2).toBe('30,00');
  });

  it('preserva os placares anteriores quando a API não retorna pontuação', () => {
    const result = updateCopaBrasilFases(
      initialFases,
      5,
      new Map([['101', null], ['102', undefined]]),
      idByName,
    );
    expect(result['1ª Fase'].matches[0]).toEqual(initialFases['1ª Fase'].matches[0]);
  });

  it('não altera fases quando a rodada não pertence à Copa do Brasil', () => {
    expect(updateCopaBrasilFases(initialFases, 24, new Map(), idByName)).toBe(initialFases);
  });

  it('registra o torneio em shadow e mantém o cron desativado', () => {
    const { def, season } = resolveDefinition('copa_brasil');
    expect(season).toBe(2026);
    expect(def.persistMode).toBe('shadow');
    expect(def.activeSync).toBe('api');
    expect(def.cron?.enabled).toBe(false);
    expect(selectAdapters(def).map((adapter) => adapter.id)).toEqual([
      'cartola_brasileirao_copa_brasil_v1',
    ]);
    expect(cartolaCopaBrasilAdapter.id).toBe('cartola_brasileirao_copa_brasil_v1');
  });

  it('monta o baseline a partir da chave legada copa:brasil', async () => {
    const legacy = {
      fases: initialFases,
      dados_externos: { rows: [['Time A', '101', 'badge-a'], ['Time B', '102', 'badge-b']] },
    };
    const payload = await readLegacyTournament('copa_brasil', 2026, async (key) =>
      key === 'copa:brasil' ? legacy : null,
    );
    expect(payload?.fases['1ª Fase']).toEqual(initialFases['1ª Fase']);
    expect(payload?.dados_externos.rows).toHaveLength(2);
  });
});
