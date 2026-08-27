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
    if (shadowParam !== null && authMode !== 'admin') {
      return json(
        { error: 'Parâmetro "shadow" é restrito a administradores autenticados' },
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

    // Shadow é o padrão seguro; só sai dele com persistMode='official' + admin.
    const shadow = !(baseDef.persistMode === 'official' && authMode === 'admin' && shadowParam === 'false');

    const key = shadowKey(baseDef.league, resolvedSeason);
    const def = shadow ? { ...baseDef, cacheKey: () => key } : baseDef;
    const repo = shadow
      ? createShadowRepository({
          supabaseAdmin,
          league: baseDef.league,
          season: resolvedSeason,
          legacyReader: createSupabaseLegacyReader(supabaseAdmin),
        })
      : createSheetsCacheRepository(supabaseAdmin);

    const result = await runPipeline(def, resolvedSeason, scope, repo, {
      dryRun,
      compare,
      persist,
      syncedBy,
      authMode,
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

