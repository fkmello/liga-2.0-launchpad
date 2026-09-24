import { afterEach, describe, expect, it, vi } from 'vitest';
import { cartolaBrasileiraoSerieBAdapter } from '../../supabase/functions/_shared/providers/cartola-brasileirao/adapter-serie-b';

const rows = [
  ['Time A', '101'],
  ['Time B', '102'],
];

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => '' } as Response;
}

describe('adapter consolidado da Série B', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mantém o ID próprio e mercado aberto aponta para a rodada anterior', async () => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith('/mercado/status')) {
        return response({ rodada_atual: 29, status_mercado: 1 });
      }
      if (/\/time\/id\/\d+\/28$/.test(url)) {
        return response({ rodada_atual: 28, pontos: 50 });
      }
      return response({ time: { nome: url.includes('/101') ? 'Time A' : 'Time B' } });
    });

    expect(cartolaBrasileiraoSerieBAdapter.id).toBe('cartola_brasileirao_serie_b_v1');
    await cartolaBrasileiraoSerieBAdapter.fetchRaw({
      league: 'brasileirao_serie_b',
      season: 2026,
      scope: { kind: 'dados_externos' },
      fetchJson: async () => ({}),
      previous: {
        fases: {
          rodada_28: {
            matches: [{ team1: 'Time A', team2: 'Time B', score1: '40', score2: '30' }],
          },
        },
        classificacao: { grupos: { geral: [] } },
        dados_externos: { rows },
      },
    });

    expect(requested.filter((url) => /\/time\/id\/\d+\/28$/.test(url))).toHaveLength(2);
    expect(requested.some((url) => /\/time\/id\/\d+\/29$/.test(url))).toBe(false);
  });
});