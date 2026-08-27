import { useQuery } from '@tanstack/react-query';
import { buildCartolaUrl } from '@/config/cartolaEndpoint';

interface MarketStatus {
  rodada_atual: number;
  status_mercado: number;
  fechamento?: { timestamp?: number };
  [k: string]: unknown;
}

/**
 * Busca o status do mercado para o endpoint do torneio informado.
 * - `league` ausente → endpoint `default` (Brasileirão)
 * - `league` informado → resolvido via TOURNAMENT_API_MAP (ex: 'campeoes')
 */
export function useMarketStatus(league?: string) {
  return useQuery<MarketStatus>({
    queryKey: ['market_status', league ?? 'default'],
    queryFn: async () => {
      const url = buildCartolaUrl({ action: 'market_status' }, league);
      const res = await fetch(url, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error(`market_status failed: ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    enabled: league !== undefined,
  });
}
