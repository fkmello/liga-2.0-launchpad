import type { CacheRepository, SaveContext } from './repository.ts';
import type { TournamentCachePayload } from '../tournament/types.ts';
import { diffPayloads, type CacheComparison } from './diff.ts';
import { readLegacyTournament, type LegacyKeyReader } from './legacy/reader.ts';
import { shadowKey } from './shadowKeys.ts';

/**
 * Repositório genérico de shadow mode:
 *  - `load`  → baseline consolidado do sistema legado (via LegacyCacheReader)
 *  - `save`  → grava EXCLUSIVAMENTE em `shadow/{league}/{season}`
 *
 * É impossível sobrescrever o cache oficial do app por aqui.
 */
export function createShadowRepository(opts: {
  supabaseAdmin: any;
  league: string;
  season: number | string;
  legacyReader: LegacyKeyReader;
}): CacheRepository & { shadowKey: string } {
  const key = shadowKey(opts.league, opts.season);

  const repo: CacheRepository & { shadowKey: string } = {
    shadowKey: key,

    async load(): Promise<TournamentCachePayload | null> {
      return await readLegacyTournament(opts.league, opts.season, opts.legacyReader);
    },

    async compare(_key: string, next: TournamentCachePayload): Promise<CacheComparison> {
      return diffPayloads(await repo.load(''), next);
    },

    async save(_key: string, payload: TournamentCachePayload, ctx: SaveContext) {
      const { data: existing } = await opts.supabaseAdmin
        .from('sheets_cache')
        .select('data')
        .eq('cache_key', key)
        .maybeSingle();
      const currentHash = (existing?.data as TournamentCachePayload | undefined)?.metadata?.hash;
      if (currentHash && currentHash === payload.metadata?.hash) {
        return { changed: false };
      }
      const { error } = await opts.supabaseAdmin.from('sheets_cache').upsert(
        {
          cache_key: key,
          type: `shadow_${ctx.type}`,
          data: payload,
          synced_at: new Date().toISOString(),
          synced_by: ctx.syncedBy,
        },
        { onConflict: 'cache_key' },
      );
      if (error) throw new Error(error.message);
      return { changed: true };
    },
  };

  return repo;
}
