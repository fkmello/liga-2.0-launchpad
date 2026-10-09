import type { CacheRepository, SaveContext } from './repository.ts';
import type { TournamentCachePayload } from '../tournament/types.ts';
import { diffPayloads, type CacheComparison } from './diff.ts';
import { readLegacyTournament, type LegacyKeyReader } from './legacy/reader.ts';
import { shadowKey } from './shadowKeys.ts';
import { mergeCopaBrasilFasesPreservingScores, mergeFasesPreservingScores } from './roundPreservation.ts';

/**
 * Repositório genérico de shadow mode:
 *  - `load`  → baseline CUMULATIVO: payload shadow já persistido (fonte
 *              primária) combinado com o baseline legado (fallback/complemento),
 *              sempre preservando as rodadas que já têm placares.
 *  - `save`  → grava EXCLUSIVAMENTE em `shadow/{league}/{season}`, com uma
 *              trava final que impede apagar rodadas já consolidadas.
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

  async function readShadow(): Promise<TournamentCachePayload | null> {
    const { data } = await opts.supabaseAdmin
      .from('sheets_cache')
      .select('data')
      .eq('cache_key', key)
      .maybeSingle();
    const payload = (data?.data ?? null) as TournamentCachePayload | null;
    return isUsableShadow(payload) ? payload : null;
  }

  const repo: CacheRepository & { shadowKey: string } = {
    shadowKey: key,

    async load(): Promise<TournamentCachePayload | null> {
      const shadow = await readShadow();
      const legacy = await readLegacyTournament(opts.league, opts.season, opts.legacyReader);

      // Primeira criação (ou shadow inválido): fluxo legado inalterado.
      if (!shadow) return legacy;
      if (!legacy) return shadow;

      return {
        ...shadow,
        fases: mergeForLeague(opts.league, legacy.fases, shadow.fases),
        classificacao: hasGrupos(shadow) ? shadow.classificacao : legacy.classificacao,
        dados_externos: (shadow.dados_externos?.rows ?? []).length
          ? shadow.dados_externos
          : legacy.dados_externos,
      };
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
      const current = (existing?.data ?? null) as TournamentCachePayload | null;

      // Trava final: nenhuma rodada já consolidada pode ser gravada vazia.
      const safePayload: TournamentCachePayload = current
        ? { ...payload, fases: mergeForLeague(opts.league, current.fases, payload.fases) }
        : payload;

      const currentHash = current?.metadata?.hash;
      if (currentHash && currentHash === safePayload.metadata?.hash) {
        return { changed: false };
      }
      const { error } = await opts.supabaseAdmin.from('sheets_cache').upsert(
        {
          cache_key: key,
          type: `shadow_${ctx.type}`,
          data: safePayload,
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

function hasGrupos(payload: TournamentCachePayload | null): boolean {
  return Object.keys(payload?.classificacao?.grupos ?? {}).length > 0;
}

/** Shadow só serve de baseline se tiver estrutura utilizável. */
function isUsableShadow(payload: TournamentCachePayload | null): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const fases = Object.keys(payload.fases ?? {}).length;
  const grupos = Object.keys(payload.classificacao?.grupos ?? {}).length;
  const rows = (payload.dados_externos?.rows ?? []).length;
  return fases + grupos + rows > 0;
}


/** Usa a lógica reforçada somente na Copa do Brasil; mantém as Séries A/B/C intactas. */
function mergeForLeague(
  league: string,
  prev: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return league === 'copa_brasil'
    ? mergeCopaBrasilFasesPreservingScores(prev, next)
    : mergeFasesPreservingScores(prev, next);
}
