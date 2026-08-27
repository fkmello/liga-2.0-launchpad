import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runPipeline } from '../_shared/sync/pipeline/index.ts';
import { createShadowRepository } from '../_shared/cache/shadowRepository.ts';
import { createSupabaseLegacyReader } from '../_shared/cache/legacy/reader.ts';
import { resolveDefinition } from '../_shared/tournament/registry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const league = 'brasileirao_serie_a';
  const season = 2026;
  const scope = { kind: 'rodada', rodada: 22 } as any;

  const { def: baseDef } = resolveDefinition(league, season);
  const repo = createShadowRepository({
    supabaseAdmin,
    league,
    season,
    legacyReader: createSupabaseLegacyReader(supabaseAdmin),
  });

  // Forçar o targetRound injetando um adapter customizado
  const originalAdapter = baseDef.adapters[0];
  const forcedAdapter = {
    ...originalAdapter,
    async fetchRaw(ctx: any) {
      const { fetchCartolaTeams, fetchTeamsRoundScores } = await import('../_shared/providers/cartola-brasileirao/api-client.ts');
      const targetRound = 22;
      const ids = (originalAdapter as any).extractIds?.(ctx) || [];
      const [teams, scores] = await Promise.all([
        fetchCartolaTeams(ids),
        fetchTeamsRoundScores(ids, targetRound)
      ]);
      const idByName = (originalAdapter as any).buildIdByName?.(ctx) || new Map();
      const { matches, fases } = (originalAdapter as any).extractMatches?.(ctx, targetRound, scores, idByName) || { matches: [], fases: {} };
      return { teams, matches, fases };
    }
  };

  const forcedDef = { ...baseDef, adapters: [forcedAdapter] };
  const result = await runPipeline(forcedDef, season, scope, repo, {
    persist: true,
    authMode: 'admin',
    syncedBy: '7912673a-58bd-4e8c-8aaa-4f9cab1914bc',
  });

  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
