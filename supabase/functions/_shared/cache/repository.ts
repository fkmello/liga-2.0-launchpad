import type { TournamentCachePayload } from '../tournament/types.ts';
import type { CacheComparison } from './diff.ts';

export interface SaveContext {
  type: string;
  /** UUID do usuário admin, ou null quando executado via cron (coluna é uuid). */
  syncedBy: string | null;
}

export interface CacheRepository {
  load(key: string): Promise<TournamentCachePayload | null>;
  save(
    key: string,
    payload: TournamentCachePayload,
    ctx: SaveContext,
  ): Promise<{ changed: boolean }>;
  compare(key: string, next: TournamentCachePayload): Promise<CacheComparison>;
}
