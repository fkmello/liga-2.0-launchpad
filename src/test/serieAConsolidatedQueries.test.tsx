/**
 * Evidência de consumo: quantas leituras de `sheets_cache` a Série A dispara
 * por carregamento, com a flag ligada e desligada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const selectCalls: { keys: string[] }[] = [];

vi.mock('@/integrations/supabase/client', () => {
  const from = () => ({
    select: () => ({
      in: (_col: string, keys: string[]) => {
        selectCalls.push({ keys });
        return Promise.resolve({ data: [{ cache_key: keys[0], data: PAYLOAD }], error: null });
      },
      eq: (_col: string, key: string) => ({
        maybeSingle: () => {
          selectCalls.push({ keys: [key] });
          return Promise.resolve({ data: { data: {} }, error: null });
        },
      }),
    }),
  });
  return { supabase: { from, auth: { getSession: async () => ({ data: { session: null } }) } } };
});

const PAYLOAD = {
  fases: {
    rodada_21: {
      tournament: 'Serie A',
      round: '21',
      matches: [{ team1: 'A', team2: 'B', score1: 10, score2: 20, matchOrder: 1 }],
    },
  },
  classificacao: {
    grupos: {
      geral: [
        { teamName: 'A', played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 10, goalsAgainst: 0, goalDiff: 10, points: 3, position: 1 },
      ],
    },
  },
  dados_externos: { rows: [['A', '', '', 'url']] },
};

function Harness({ league }: { league: string }) {
  const { useConfrontos, useClassificacao, useDadosExternos } = hooks;
  useConfrontos(21, league);
  useClassificacao(league);
  useDadosExternos(league);
  return <div>ok</div>;
}

let hooks: typeof import('@/hooks/useGoogleSheets');

async function loadHooks(flag: boolean) {
  vi.resetModules();
  vi.doMock('@/config/featureFlags', () => ({ USE_CONSOLIDATED_SERIE_A: flag }));
  hooks = await import('@/hooks/useGoogleSheets');
}

function renderHarness(league = 'serie_a') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness league={league} />
    </QueryClientProvider>,
  );
}

async function settle() {
  for (let i = 0; i < 40 && selectCalls.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 25));
  }
  await new Promise((r) => setTimeout(r, 100));
}

beforeEach(() => {
  selectCalls.length = 0;
});

describe('Série A — leituras de sheets_cache por carregamento', () => {
  it('flag ON: exatamente UMA leitura, na chave consolidada', async () => {
    await loadHooks(true);
    renderHarness();
    await settle();
    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0].keys).toEqual(['shadow/brasileirao_serie_a/2026']);
  });

  it('flag OFF: caminho legado inalterado — sem leitura em lote das 38 rodadas', async () => {
    await loadHooks(false);
    renderHarness();
    await settle();
    const allKeys = selectCalls.flatMap((c) => c.keys);
    expect(allKeys.sort()).toEqual([
      'classificacao:serie_a',
      'dados_externos:serie_a',
      'resultados:serie_a:21',
    ]);
    expect(allKeys.filter((k) => k.startsWith('resultados:'))).toHaveLength(1);
    expect(allKeys.some((k) => k.startsWith('shadow/'))).toBe(false);
  });

  it('flag ON não afeta outras ligas (Série B segue legado)', async () => {
    await loadHooks(true);
    renderHarness('serie_b');
    await settle();
    const allKeys = selectCalls.flatMap((c) => c.keys).sort();
    expect(allKeys).toEqual([
      'classificacao:serie_b',
      'dados_externos:serie_b',
      'resultados:serie_b:21',
    ]);
  });
});
