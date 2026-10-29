import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runPipeline, NoEligibleAdapterError } from '../_shared/sync/pipeline/index.ts';
import { createSheetsCacheRepository } from '../_shared/cache/sheetsCacheRepository.ts';
import { createShadowRepository } from '../_shared/cache/shadowRepository.ts';
import { createSupabaseLegacyReader } from '../_shared/cache/legacy/reader.ts';
import { shadowKey } from '../_shared/cache/shadowKeys.ts';
import { resolveDefinition } from '../_shared/tournament/registry.ts';
import type { SyncScope } from '../_shared/tournament/types.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-sync-secret',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function parseScope(params: URLSearchParams): SyncScope {
  const kind = params.get('scope') ?? 'all';
  if (kind === 'dados_externos') return { kind: 'dados_externos' };
  if (kind === 'rodada') {
    const rodada = Number(params.get('rodada'));
    if (!Number.isInteger(rodada) || rodada < 1 || rodada > 50) {
      throw new Error('rodada inválida para scope=rodada');
    }
    return { kind: 'rodada', rodada };
  }
  if (kind === 'fase') {
    const fase = (params.get('fase') ?? '').trim();
    if (!fase) throw new Error('fase obrigatória para scope=fase');
    return { kind: 'fase', fase };
  }
  if (kind !== 'all') throw new Error(`scope inválido: ${kind}`);
  return { kind: 'all' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── Auth: secret de cron (máquina) OU JWT de admin (humano) ──
    const cronSecret =
      Deno.env.get('TOURNAMENT_SYNC_SECRET_V2') ?? Deno.env.get('TOURNAMENT_SYNC_SECRET');

    const providedSecret = req.headers.get('x-sync-secret');
    // Coluna sheets_cache.synced_by é uuid → cron grava null (não "cron").
    let syncedBy: string | null = null;
    let authMode: 'secret' | 'admin' = 'secret';

    if (cronSecret && providedSecret && providedSecret === cronSecret) {
      authMode = 'secret';
    } else {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autorizado' }, 401);
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
        authHeader.replace('Bearer ', ''),
      );
      if (claimsError || !claimsData?.claims) return json({ error: 'Não autorizado' }, 401);
      const userId = claimsData.claims.sub as string;
      const { data: roleData } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      if (!roleData) return json({ error: 'Acesso negado — apenas admins' }, 403);
      authMode = 'admin';
      syncedBy = userId;
    }

    // ── Input validation (apenas parâmetros de escopo, nunca de comportamento) ──
    const url = new URL(req.url);
    const league = (url.searchParams.get('league') ?? '').trim();
    if (!league) return json({ error: 'Parâmetro "league" é obrigatório' }, 400);

    const seasonParam = url.searchParams.get('season');
    let season: number | undefined;
    if (seasonParam !== null) {
      season = Number(seasonParam);
      if (!Number.isInteger(season) || season < 2000 || season > 2100) {
        return json({ error: 'season inválida' }, 400);
      }
    }

    let scope: SyncScope;
    try {
      scope = parseScope(url.searchParams);
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }

    let baseDef;
    let resolvedSeason: number;
    try {
      const resolved = resolveDefinition(league, season);
      baseDef = resolved.def;
      resolvedSeason = resolved.season;
    } catch (e) {
      return json({ error: (e as Error).message }, 404);
    }

    // `source`/`activeSync` não são mais aceitos pela URL — o registry decide.
    if (url.searchParams.has('source') || url.searchParams.has('activeSync')) {
      return json(
        { error: 'Parâmetro não permitido: a fonte de sincronização é definida pelo registry' },
        400,
      );
    }

    const dryRun = url.searchParams.get('dry_run') === 'true';
    const compare = url.searchParams.get('compare') === 'true';
    const persist = url.searchParams.get('persist') === 'true';

    // ── Destino de escrita: registry manda; `shadow=false` é privilégio de admin ──
    const shadowParam = url.searchParams.get('shadow');
    const trustedCronOfficialWrite =
      authMode === 'secret' &&
      shadowParam === 'false' &&
      baseDef.persistMode === 'official' &&
      baseDef.cron?.allowOfficialPersistence === true;
    if (shadowParam !== null && authMode !== 'admin' && !trustedCronOfficialWrite) {
      return json(
        { error: 'Parâmetro "shadow" é restrito a administradores autenticados ou cron explicitamente autorizado' },
        403,
      );
    }
    if (shadowParam === 'false' && baseDef.persistMode !== 'official') {
      return json(
        {
          error:
            `Torneio '${baseDef.league}' está em persistMode='shadow'; ` +
            'escrita na cache oficial é bloqueada por configuração do registry',
        },
        403,
      );
    }

    // Shadow é o padrão seguro; cache oficial exige persistMode='official' e admin ou cron explicitamente autorizado.
    const shadow = !(baseDef.persistMode === 'official' && shadowParam === 'false' && (authMode === 'admin' || trustedCronOfficialWrite));

    const key = shadowKey(baseDef.league, resolvedSeason);
    const def = shadow ? { ...baseDef, cacheKey: () => key } : baseDef;
    const legacyReader = createSupabaseLegacyReader(supabaseAdmin);
    const repoBase = shadow
      ? createShadowRepository({
          supabaseAdmin,
          league: baseDef.league,
          season: resolvedSeason,
          legacyReader,
        })
      : createSheetsCacheRepository(supabaseAdmin);

    // When first promoting Sul-Americana to official storage, seed the pipeline's
    // previous payload from its validated shadow cache if no official cache exists.
    // Saving still goes only through the official repository and its normal validation.
    const sulamericanaShadowBaseline = !shadow && baseDef.league === 'sulamericana'
      ? createShadowRepository({
          supabaseAdmin,
          league: baseDef.league,
          season: resolvedSeason,
          legacyReader,
        })
      : null;
    const repo = sulamericanaShadowBaseline
      ? {
          ...repoBase,
          async load(cacheKey: string) {
            const officialPayload = await repoBase.load(cacheKey);
            if (officialPayload) return officialPayload;
            return await sulamericanaShadowBaseline.load(shadowKey(baseDef.league, resolvedSeason));
          },
        }
      : repoBase;

    // Sul-Americana reads the Libertadores shadow payload read-only to import
    // its two best third-place qualifiers. No cross-tournament write is performed.
    const relatedPayloads: Record<string, any> = {};
    if (baseDef.league === 'sulamericana') {
      const libertadoresRepo = createShadowRepository({
        supabaseAdmin,
        league: 'libertadores',
        season: resolvedSeason,
        legacyReader: createSupabaseLegacyReader(supabaseAdmin),
      });
      relatedPayloads.libertadores = await libertadoresRepo.load(shadowKey('libertadores', resolvedSeason));
    }

    // For the new Copa do Brasil season, refresh only participant rows from the
    // spreadsheet cache. Keep the active API cache's phases/history untouched.
    let previousDataOverride: { rows: unknown[] } | undefined;
    if (baseDef.league === 'copa_brasil' && resolvedSeason >= 2027) {
      const legacyCopa = await legacyReader('copa:brasil');
      const sourceRows = legacyCopa?.dados_externos?.rows;
      const ids = Array.isArray(sourceRows)
        ? sourceRows.map((row: any) => {
            const cells = Array.isArray(row) ? row : [row?.id_cartola ?? row?.id];
            const candidate = cells[1] && /^\\d{3,}$/.test(String(cells[1]).trim())
              ? cells[1]
              : cells.find((cell: unknown) => /^\\d{3,}$/.test(String(cell ?? '').trim()));
            return candidate === undefined ? '' : String(candidate).trim();
          })
        : [];
      const preliminaryCount = Array.isArray(sourceRows)
        ? sourceRows.filter((row: any) => String(Array.isArray(row) ? row[3] ?? '' : row?.role ?? '').toLowerCase().includes('prelim')).length
        : 0;
      const invitedCount = Array.isArray(sourceRows)
        ? sourceRows.filter((row: any) => String(Array.isArray(row) ? row[3] ?? '' : row?.role ?? '').toLowerCase().includes('convid')).length
        : 0;
      // Fail closed: require the complete roster and source-tab markers before replacing
      // participant rows. This prevents a stale/partial import from changing the draw.
      if (Array.isArray(sourceRows) && sourceRows.length === 60 && ids.every(Boolean) &&
          new Set(ids).size === 60 && preliminaryCount === 56 && invitedCount === 4) {
        previousDataOverride = { rows: sourceRows };
      } else {
        throw new Error(
          '[copa_brasil] sincronização bloqueada: importe a planilha com 56 participantes preliminares e 4 convidados (60 IDs Cartola únicos) antes de sincronizar a temporada 2027+',
        );
      }
    }

    const result = await runPipeline(def, resolvedSeason, scope, repo, {
      dryRun,
      compare,
      persist,
      syncedBy,
      authMode,
      relatedPayloads,
      previousDataOverride,
    });


    return json({
      ok: result.errors.length === 0,
      dry_run: dryRun,
      compare,
      persist,
      shadow,
      persist_mode: baseDef.persistMode,
      auth_mode: authMode,
      source: def.activeSync as string,
      ...result,
      payload: dryRun ? result.payload : undefined,
    });

  } catch (e) {
    if (e instanceof NoEligibleAdapterError) {
      console.error('[sync-tournament-api] adapter:', e.message);
      return json({ error: e.message }, e.status);
    }
    console.error('[sync-tournament-api] erro:', (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});

