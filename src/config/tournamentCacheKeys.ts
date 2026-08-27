/**
 * ÚNICA fonte de verdade sobre qual chave do `sheets_cache` é lida pelo
 * caminho consolidado. A montagem do prefixo shadow fica encapsulada aqui —
 * nenhum hook, componente ou lógica de negócio conhece a string `shadow/`.
 *
 * Separação de responsabilidades:
 *  - a feature flag decide o CONTRATO (legado x consolidado);
 *  - esta função decide a CHAVE.
 */

const SHADOW_PREFIX = 'shadow/';

export const DEFAULT_SEASON = 2026;

type Stage = 'shadow' | 'official';

/** Identificador do torneio no backend (pode diferir do id usado no frontend). */
const BACKEND_LEAGUE_ID: Record<string, string> = {
  serie_a: 'brasileirao_serie_a',
};

/**
 * Estágio atual de cada torneio. Na promoção para a cache oficial basta
 * trocar UMA linha deste mapa.
 */
const STAGE_BY_LEAGUE: Record<string, Stage> = {
  serie_a: 'shadow',
};

export function getTournamentCacheKey(league: string, season: number | string): string {
  const backendLeague = BACKEND_LEAGUE_ID[league] ?? league;
  const stage = STAGE_BY_LEAGUE[league] ?? 'shadow';
  return stage === 'shadow'
    ? `${SHADOW_PREFIX}${backendLeague}/${season}`
    : `${backendLeague}/${season}`;
}
