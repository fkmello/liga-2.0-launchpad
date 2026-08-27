import { fetchJsonWithRetry } from '../sync/http.ts';

/**
 * Provedores de status de mercado. O dispatcher NUNCA conhece uma URL da
 * Cartola — ele resolve `def.cron.statusProvider` neste registro.
 */
export interface MarketStatus {
  status_mercado: number;
  rodada_atual: number;
}

export interface MarketStatusProvider {
  id: string;
  getMarketStatus(season: number): Promise<MarketStatus>;
}

function toMarketStatus(raw: unknown): MarketStatus {
  const r = (raw ?? {}) as Record<string, unknown>;
  const status = Number(r.status_mercado);
  const rodada = Number(r.rodada_atual);
  if (!Number.isFinite(status) || !Number.isFinite(rodada)) {
    throw new Error('Resposta de status de mercado inválida');
  }
  return { status_mercado: status, rodada_atual: rodada };
}

const cartolaProvider: MarketStatusProvider = {
  id: 'cartola',
  async getMarketStatus() {
    return toMarketStatus(
      await fetchJsonWithRetry('https://api.cartola.globo.com/mercado/status'),
    );
  },
};

const cartolaCopaProvider: MarketStatusProvider = {
  id: 'cartola_copa',
  async getMarketStatus() {
    return toMarketStatus(
      await fetchJsonWithRetry('https://api.copa.cartola.globo.com/mercado/status'),
    );
  },
};

const PROVIDERS: Record<string, MarketStatusProvider> = {
  cartola: cartolaProvider,
  cartola_copa: cartolaCopaProvider,
};

export type StatusProviderId = keyof typeof PROVIDERS | string;

export function resolveStatusProvider(id: string): MarketStatusProvider {
  const provider = PROVIDERS[id];
  if (!provider) throw new Error(`Status provider não registrado: ${id}`);
  return provider;
}
