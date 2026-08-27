import { LEGACY_STRATEGIES, type LegacyReadContext, type LegacyStrategy } from './strategies.ts';
import type { TournamentCachePayload } from '../../tournament/types.ts';

export type LegacyKeyReader = (cacheKey: string) => Promise<any | null>;

/** Leitor de cache legado a partir do Supabase (`sheets_cache`). */
export function createSupabaseLegacyReader(supabaseAdmin: any): LegacyKeyReader {
  return async (cacheKey: string) => {
    const { data } = await supabaseAdmin
      .from('sheets_cache')
      .select('data')
      .eq('cache_key', cacheKey)
      .maybeSingle();
    return data?.data ?? null;
  };
}

export function resolveLegacyStrategy(league: string): LegacyStrategy {
  const strategy = LEGACY_STRATEGIES[league];
  if (!strategy) throw new Error(`Sem estratégia legada registrada para o torneio: ${league}`);
  return strategy;
}

/**
 * LegacyCacheReader — camada genérica que sabe montar o payload consolidado
 * de QUALQUER torneio a partir do formato legado.
 */
export async function readLegacyTournament(
  league: string,
  season: number | string,
  read: LegacyKeyReader,
): Promise<TournamentCachePayload | null> {
  const strategy = resolveLegacyStrategy(league);
  const ctx: LegacyReadContext = { league, season, read };
  return await strategy.read(ctx);
}
