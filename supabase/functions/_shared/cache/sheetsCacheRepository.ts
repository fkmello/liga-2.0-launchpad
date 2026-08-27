import type { CacheRepository, SaveContext } from './repository.ts';
import type { TournamentCachePayload } from '../tournament/types.ts';
import { diffPayloads, type CacheComparison } from './diff.ts';

/** Única implementação que conhece Supabase. Cliente é injetado. */
export function createSheetsCacheRepository(supabaseAdmin: any): CacheRepository {
  return {
    async load(key: string): Promise<TournamentCachePayload | null> {
      const { data } = await supabaseAdmin
        .from('sheets_cache')
        .select('data')
        .eq('cache_key', key)
        .maybeSingle();
      return (data?.data as TournamentCachePayload) ?? null;
    },

    async compare(key: string, next: TournamentCachePayload): Promise<CacheComparison> {
      const current = await this.load(key);
      return diffPayloads(current, next);
    },

    async save(key: string, payload: TournamentCachePayload, ctx: SaveContext) {
      const current = await this.load(key);
      const currentHash = current?.metadata?.hash;
      if (currentHash && currentHash === payload.metadata?.hash) {
        return { changed: false };
      }
      const { error } = await supabaseAdmin.from('sheets_cache').upsert(
        {
          cache_key: key,
          type: ctx.type,
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
}

/** Implementação em memória — usada em testes. */
export function createInMemoryCacheRepository(
  seed: Record<string, TournamentCachePayload> = {},
): CacheRepository & { store: Record<string, TournamentCachePayload> } {
  const store: Record<string, TournamentCachePayload> = { ...seed };
  return {
    store,
    async load(key) {
      return store[key] ?? null;
    },
    async compare(key, next) {
      return diffPayloads(store[key] ?? null, next);
    },
    async save(key, payload) {
      const currentHash = store[key]?.metadata?.hash;
      if (currentHash && currentHash === payload.metadata?.hash) return { changed: false };
      store[key] = payload;
      return { changed: true };
    },
  };
}
