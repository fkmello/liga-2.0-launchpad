import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchJsonWithRetry } from '../_shared/sync/http.ts';
import { parseClassicLeagueRoster, resolveClassicLeagueCompletedRound, type ClassicLeagueRosterTeam } from '../_shared/classicLeagueRules.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const API = 'https://api.cartola.globo.com';
const MAX_CONCURRENCY = 8;
const SEASON_MIN = 2000;
const SEASON_MAX = 2100;

type MarketStatus = { status_mercado: number; rodada_atual: number };
type RosterTeam = ClassicLeagueRosterTeam;
type CartolaTeam = {
  pontos_campeonato?: number;
  time?: { nome?: string; url_escudo_svg?: string };
};

async function fetchTeam(team: RosterTeam, round: number) {
  const url = `${API}/time/id/${encodeURIComponent(team.id)}/${round}`;
  const payload = await fetchJsonWithRetry(url, {}, { timeoutMs: 12000, retries: 2 }) as CartolaTeam;
  const rawPoints = payload?.pontos_campeonato;
  const points = typeof rawPoints === 'number'
    ? rawPoints
    : typeof rawPoints === 'string' && rawPoints.trim() !== ''
      ? Number(rawPoints)
      : Number.NaN;
  if (!Number.isFinite(points)) {
    throw new Error(`Resposta inválida para o time ${team.name} (${team.id}): pontos_campeonato ausente ou não numérico.`);
  }
  return {
    cartola_team_id: team.id,
    team_name: String(payload?.time?.nome ?? team.name),
    badge_url: String(payload?.time?.url_escudo_svg ?? team.badge ?? '') || null,
    points_championship: points,
    raw_payload: { pontos_campeonato: points },
  };
}

async function inChunks<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: 'Configuração Supabase incompleta.' }, 500);
    }

    // Apenas usuário autenticado com papel admin pode iniciar um snapshot.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autorizado.' }, 401);
    const token = authHeader.slice('Bearer '.length);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) return json({ error: 'Não autorizado.' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const userId = String(claimsData.claims.sub);
    const { data: role, error: roleError } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (roleError) throw new Error(`Falha ao validar papel administrativo: ${roleError.message}`);
    if (!role) return json({ error: 'Acesso negado — apenas admins.' }, 403);

    const url = new URL(req.url);
    const season = url.searchParams.has('season')
      ? Number(url.searchParams.get('season'))
      : new Date().getFullYear();
    if (!Number.isInteger(season) || season < SEASON_MIN || season > SEASON_MAX) {
      return json({ error: 'Parâmetro season inválido.' }, 400);
    }

    const market = await fetchJsonWithRetry(`${API}/mercado/status`, {}, { timeoutMs: 10000, retries: 2 }) as MarketStatus;
    const targetRound = resolveClassicLeagueCompletedRound(market);

    const { data: cache, error: cacheError } = await admin
      .from('sheets_cache')
      .select('data')
      .eq('cache_key', 'dados_externos:liga_classica')
      .maybeSingle();
    if (cacheError) throw new Error(`Falha ao carregar participantes: ${cacheError.message}`);
    if (!cache?.data) throw new Error('Cache dados_externos:liga_classica não encontrado.');
    const roster = parseClassicLeagueRoster(cache.data);

    const { data: existing, error: existingError } = await admin
      .from('classic_league_round_snapshots')
      .select('id,status,received_team_count,requested_at')
      .eq('season_year', season)
      .eq('round_number', targetRound)
      .maybeSingle();
    if (existingError) throw new Error(`Falha ao consultar snapshot existente: ${existingError.message}`);
    if (existing?.status === 'complete') {
      return json({
        ok: true, already_complete: true, season, round: targetRound,
        snapshot_id: existing.id, received_team_count: existing.received_team_count,
      });
    }
    if (existing?.status === 'in_progress') {
      return json({
        error: 'Já existe uma sincronização em andamento para esta rodada. Se ela foi interrompida, será necessária recuperação administrativa.',
        snapshot_id: existing.id,
        requested_at: existing.requested_at,
      }, 409);
    }

    let snapshotId: string;
    if (existing?.id) {
      // Compare-and-set: apenas uma solicitação pode reivindicar um snapshot failed.
      // A condição no status evita que duas tentativas concorrentes assumam o mesmo registro.
      const { data: reclaimed, error: resetError } = await admin
        .from('classic_league_round_snapshots')
        .update({
          status: 'in_progress', source: 'cartola_api',
          source_endpoint: `${API}/time/id/{id}/${targetRound}`,
          market_round: market.rodada_atual, market_status: market.status_mercado,
          expected_team_count: 60, received_team_count: 0,
          requested_at: new Date().toISOString(), completed_at: null, error_message: null,
          metadata: { retried: true, requested_by: userId },
        })
        .eq('id', existing.id)
        .eq('status', 'failed')
        .select('id')
        .maybeSingle();
      if (resetError) throw new Error(`Falha ao reiniciar snapshot: ${resetError.message}`);
      if (!reclaimed?.id) {
        return json({ error: 'Outra solicitação já assumiu a recuperação deste snapshot. Consulte novamente.', snapshot_id: existing.id }, 409);
      }
      snapshotId = reclaimed.id;
      const { error: deleteError } = await admin
        .from('classic_league_team_round_points').delete().eq('snapshot_id', snapshotId);
      if (deleteError) {
        await admin.from('classic_league_round_snapshots').update({
          status: 'failed', error_message: `Falha ao limpar pontos anteriores: ${deleteError.message}`,
        }).eq('id', snapshotId).eq('status', 'in_progress');
        throw new Error(`Falha ao limpar pontos de tentativa anterior: ${deleteError.message}`);
      }
    } else {
      const { data: created, error: createError } = await admin
        .from('classic_league_round_snapshots')
        .insert({
          season_year: season, round_number: targetRound, source: 'cartola_api',
          source_endpoint: `${API}/time/id/{id}/${targetRound}`,
          market_round: market.rodada_atual, market_status: market.status_mercado,
          status: 'in_progress', expected_team_count: 60,
          received_team_count: 0, metadata: { requested_by: userId },
        })
        .select('id')
        .single();
      if (createError) {
        if (createError.code === '23505') {
          return json({ error: 'Outra solicitação iniciou esta rodada simultaneamente. Consulte novamente em instantes.' }, 409);
        }
        throw new Error(`Falha ao criar snapshot: ${createError.message}`);
      }
      snapshotId = created.id;
    }

    try {
      const points = await inChunks(roster, MAX_CONCURRENCY, (team) => fetchTeam(team, targetRound));
      if (points.length !== 60 || new Set(points.map((p) => p.cartola_team_id)).size !== 60) {
        throw new Error(`Validação final falhou: recebidos ${points.length} registros.`);
      }

      const { error: pointsError } = await admin
        .from('classic_league_team_round_points')
        .insert(points.map((point) => ({ ...point, snapshot_id: snapshotId })));
      if (pointsError) throw new Error(`Falha ao gravar pontos dos participantes: ${pointsError.message}`);

      const { data: completed, error: completeError } = await admin
        .from('classic_league_round_snapshots')
        .update({
          status: 'complete', received_team_count: points.length,
          completed_at: new Date().toISOString(), error_message: null,
          metadata: { requested_by: userId, market_round: market.rodada_atual, market_status: market.status_mercado },
        })
        .eq('id', snapshotId)
        .eq('status', 'in_progress')
        .select('id')
        .maybeSingle();
      if (completeError) throw new Error(`Falha ao concluir snapshot: ${completeError.message}`);
      if (!completed?.id) throw new Error('Snapshot não pôde ser marcado como completo; estado foi alterado durante a sincronização.');

      return json({
        ok: true, season, round: targetRound, market_round: market.rodada_atual,
        market_status: market.status_mercado, expected_team_count: 60,
        received_team_count: points.length, snapshot_id: snapshotId,
      });
    } catch (error) {
      const message = String((error as Error)?.message ?? error).slice(0, 1000);
      await admin.from('classic_league_team_round_points').delete().eq('snapshot_id', snapshotId);
      await admin.from('classic_league_round_snapshots').update({
        status: 'failed', received_team_count: 0, completed_at: null, error_message: message,
      }).eq('id', snapshotId);
      throw error;
    }
  } catch (error) {
    console.error('[sync-classic-league]', error);
    return json({ error: (error as Error)?.message ?? 'Erro interno.' }, 500);
  }
});
