import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const LEAGUE = 'brasileirao_serie_b';
const SEASON = 2026;
const SHADOW_KEY = `shadow/${LEAGUE}/${SEASON}`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function normalizedMatches(value: unknown) {
  const matches = Array.isArray((value as { matches?: unknown[] } | null)?.matches)
    ? (value as { matches: Record<string, unknown>[] }).matches
    : [];
  return matches.map((match) => ({
    team1: String(match.team1 ?? match.home ?? '').trim(),
    team2: String(match.team2 ?? match.away ?? '').trim(),
    score1: String(match.score1 ?? '').trim(),
    score2: String(match.score2 ?? '').trim(),
  }));
}

function sameMatches(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizedMatches(a)) === JSON.stringify(normalizedMatches(b));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const syncSecret =
      Deno.env.get('TOURNAMENT_SYNC_SECRET_V2') ?? Deno.env.get('TOURNAMENT_SYNC_SECRET');
    if (!supabaseUrl || !serviceKey || !syncSecret) {
      return json({ error: 'Configuração segura indisponível' }, 500);
    }

    const db = createClient(supabaseUrl, serviceKey);
    const { data: existing, error: existingError } = await db
      .from('sheets_cache')
      .select('cache_key')
      .eq('cache_key', SHADOW_KEY)
      .maybeSingle();
    if (existingError) return json({ error: existingError.message }, 500);
    if (existing) return json({ error: 'Shadow da Série B já existe; inicialização recusada' }, 409);

    const baseUrl = `${supabaseUrl}/functions/v1/sync-tournament-api`;
    const dryUrl =
      `${baseUrl}?league=${LEAGUE}&season=${SEASON}` +
      '&scope=dados_externos&dry_run=true&persist=false';
    const dryResponse = await fetch(dryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-secret': syncSecret },
    });
    const dry = await dryResponse.json();
    if (!dryResponse.ok || dry.ok !== true || !dry.payload) {
      return json({ error: 'Simulação falhou', dry_run: dry }, 409);
    }

    const rounds = [];
    let safe = true;
    for (let round = 1; round <= 38; round++) {
      const { data: legacyRow, error } = await db
        .from('sheets_cache')
        .select('data')
        .eq('cache_key', `resultados:serie_b:${round}`)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      const legacy = legacyRow?.data ?? null;
      const proposed = dry.payload.fases?.[`rodada_${round}`] ?? null;
      const identical = sameMatches(legacy, proposed);
      const futureFilled =
        round >= 29 && normalizedMatches(proposed).some((match) => match.score1 !== '' || match.score2 !== '');
      if (!identical || futureFilled) safe = false;
      rounds.push({
        round,
        legacy_matches: normalizedMatches(legacy).length,
        proposed_matches: normalizedMatches(proposed).length,
        identical,
        future_filled: futureFilled,
      });
    }

    if (!safe) {
      return json({
        error: 'Simulação divergiu do histórico; nada foi gravado',
        persisted: false,
        rounds,
        standings_divergences: dry.standings_divergences ?? [],
      }, 409);
    }

    const persistUrl =
      `${baseUrl}?league=${LEAGUE}&season=${SEASON}` +
      '&scope=dados_externos&persist=true';
    const persistResponse = await fetch(persistUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-secret': syncSecret },
    });
    const persisted = await persistResponse.json();
    if (!persistResponse.ok || persisted.ok !== true || persisted.persisted !== true) {
      return json({ error: 'Persistência falhou', persisted, rounds }, 409);
    }

    return json({
      ok: true,
      cache_key: SHADOW_KEY,
      scope: 'dados_externos',
      rounds,
      standings_divergences: dry.standings_divergences ?? [],
      coverage: dry.coverage ?? null,
      persisted: true,
    });
  } catch (error) {
    return json({ error: String((error as Error).message ?? error) }, 500);
  }
});
