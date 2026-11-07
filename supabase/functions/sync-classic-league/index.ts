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
  pontos_campeonato?: number | string | null;
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
    const latestCompletedRound = resolveClassicLeagueCompletedRound(market);
    const requestedRound = url.searchParams.has('round') ? Number(url.searchParams.get('round')) : null;
    if (requestedRound !== null && (!Number.isInteger(requestedRound) || requestedRound < 1 || requestedRound > latestCompletedRound)) {
      return json({ error: `Parâmetro round inválido. Informe uma rodada concluída entre 1 e ${latestCompletedRound}.` }, 400);
    }
    const targetRound = requestedRound ?? latestCompletedRound;

    // Publica novembro somente a partir dos snapshots completos já validados.
    // A operação é restrita ao par de rodadas confirmado para novembro de 2026.
    if (url.searchParams.get('action') === 'publish_monthly') {
      const period = url.searchParams.get('periodo');
      const baselineRound = Number(url.searchParams.get('baseline_round'));
      const finalRound = Number(url.searchParams.get('final_round'));
      if (season !== 2026 || period !== 'NOVEMBRO' || baselineRound !== 33 || finalRound !== 34) {
        return json({ error: 'Publicação mensal não autorizada para os parâmetros informados.' }, 400);
      }
      if (finalRound > latestCompletedRound) {
        return json({ error: `A rodada final ${finalRound} ainda não está concluída.` }, 400);
      }

      const { data: snapshots, error: snapshotsError } = await admin
        .from('classic_league_round_snapshots')
        .select('id,round_number,status,expected_team_count,received_team_count')
        .eq('season_year', season)
        .in('round_number', [baselineRound, finalRound]);
      if (snapshotsError) throw new Error(`Falha ao consultar snapshots: ${snapshotsError.message}`);
      const baseline = snapshots?.find((snapshot) => snapshot.round_number === baselineRound);
      const final = snapshots?.find((snapshot) => snapshot.round_number === finalRound);
      for (const [label, snapshot] of [['base', baseline], ['final', final]] as const) {
        if (!snapshot || snapshot.status !== 'complete' ||
            snapshot.expected_team_count !== 60 || snapshot.received_team_count !== 60) {
          return json({ error: `Snapshot ${label} da rodada ${label === 'base' ? baselineRound : finalRound} não está completo com 60 participantes.` }, 409);
        }
      }

      const { data: points, error: pointsError } = await admin
        .from('classic_league_team_round_points')
        .select('cartola_team_id,team_name,badge_url,points_championship,snapshot_id')
        .in('snapshot_id', [baseline!.id, final!.id]);
      if (pointsError) throw new Error(`Falha ao carregar pontuações: ${pointsError.message}`);
      const baseRows = points?.filter((point) => point.snapshot_id === baseline!.id) ?? [];
      const finalRows = points?.filter((point) => point.snapshot_id === final!.id) ?? [];
      if (baseRows.length !== 60 || finalRows.length !== 60) {
        return json({ error: 'Os snapshots não contêm exatamente 60 pontuações cada.' }, 409);
      }

      const baseByTeam = new Map(baseRows.map((point) => [String(point.cartola_team_id), Number(point.points_championship)]));
      const finalIds = new Set(finalRows.map((point) => String(point.cartola_team_id)));
      if (baseByTeam.size !== 60 || finalIds.size !== 60 ||
          [...baseByTeam.keys()].some((id) => !finalIds.has(id))) {
        return json({ error: 'Os participantes das rodadas 33 e 34 não correspondem integralmente.' }, 409);
      }

      const rankings = finalRows.map((point) => {
        const accumulated = Number(point.points_championship);
        const previous = baseByTeam.get(String(point.cartola_team_id));
        const monthly = accumulated - Number(previous);
        if (!Number.isFinite(accumulated) || !Number.isFinite(previous) || !Number.isFinite(monthly) || monthly < 0) {
          throw new Error(`Pontuação mensal inválida para o time ${point.team_name}.`);
        }
        return {
          badge: point.badge_url ?? '',
          total: monthly.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          position: '',
          teamName: point.team_name,
          sortPoints: monthly,
        };
      }).sort((a, b) => b.sortPoints - a.sortPoints);

      const publishedData = {
        title: 'RANKING MENSAL',
        rankings: rankings.map(({ sortPoints: _sortPoints, ...row }, index) => ({
          ...row,
          position: String(index + 1),
        })),
      };
      const { error: publishError } = await admin
        .from('sheets_cache')
        .upsert({
          cache_key: 'ranking_liga:NOVEMBRO',
          type: 'classificacao',
          data: publishedData,
          synced_at: new Date().toISOString(),
          synced_by: userId,
        }, { onConflict: 'cache_key' });
      if (publishError) throw new Error(`Falha ao publicar ranking de novembro: ${publishError.message}`);

      return json({
        ok: true, published: true, season, period,
        baseline_round: baselineRound, final_round: finalRound,
        participant_count: publishedData.rankings.length,
        total_points: rankings.reduce((sum, row) => sum + row.sortPoints, 0),
      });
    }

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
