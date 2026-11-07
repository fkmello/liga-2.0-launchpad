import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchJsonWithRetry } from '../_shared/sync/http.ts';
import { parseClassicLeagueRoster, resolveClassicLeagueCompletedRound, type ClassicLeagueRosterTeam } from '../_shared/classicLeagueRules.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-sync-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const cronMode = action === 'cron_snapshot' || action === 'publish_period';
    const cronSecret = Deno.env.get('TOURNAMENT_CRON_SECRET') ?? Deno.env.get('TOURNAMENT_SYNC_SECRET_V2') ?? Deno.env.get('TOURNAMENT_SYNC_SECRET');
    const providedSecret = req.headers.get('x-sync-secret');
    const cronAuthorized = cronMode && Boolean(cronSecret && providedSecret && providedSecret === cronSecret);

    const admin = createClient(supabaseUrl, serviceKey);
    let userId: string | null = null;
    if (!cronAuthorized) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autorizado.' }, 401);
      const token = authHeader.slice('Bearer '.length);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) return json({ error: 'Não autorizado.' }, 401);
      userId = String(claimsData.claims.sub);
      const { data: role, error: roleError } = await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      if (roleError) throw new Error(`Falha ao validar papel administrativo: ${roleError.message}`);
      if (!role) return json({ error: 'Acesso negado — apenas admins.' }, 403);
    }
    const season = url.searchParams.has('season')
      ? Number(url.searchParams.get('season'))
      : new Date().getFullYear();
    if (!Number.isInteger(season) || season < SEASON_MIN || season > SEASON_MAX) {
      return json({ error: 'Parâmetro season inválido.' }, 400);
    }

    let market: MarketStatus | null = null;
    let latestCompletedRound: number | null = null;
    const ensureMarket = async () => {
      if (latestCompletedRound === null) {
        market = await fetchJsonWithRetry(`${API}/mercado/status`, {}, { timeoutMs: 10000, retries: 2 }) as MarketStatus;
        latestCompletedRound = resolveClassicLeagueCompletedRound(market);
      }
      return latestCompletedRound;
    };
    const requestedRound = url.searchParams.has('round') ? Number(url.searchParams.get('round')) : null;
    if (requestedRound !== null) {
      const latest = await ensureMarket();
      if (!Number.isInteger(requestedRound) || requestedRound < 1 || requestedRound > latest) {
        return json({ error: `Parâmetro round inválido. Informe uma rodada concluída entre 1 e ${latest}.` }, 400);
      }
    }

    if (url.searchParams.get('action') === 'reopen_period') {
      const period = String(url.searchParams.get('periodo') ?? '').toUpperCase();
      const allowed = new Set(['1_TURNO', '2_TURNO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO']);
      if (season !== 2026 || !allowed.has(period)) return json({ error: 'Período inválido ou inativo para reabertura.' }, 400);
      const { error: reopenError } = await admin.from('league_closed_periods')
        .delete().eq('season_year', season).eq('period_key', period);
      if (reopenError) throw new Error(`Falha ao reabrir período: ${reopenError.message}`);
      return json({ ok: true, reopened: true, period });
    }

    if (url.searchParams.get('action') === 'close_period') {
      const period = String(url.searchParams.get('periodo') ?? '').toUpperCase();
      const baselines: Record<string, number> = {
        FEVEREIRO: 0, MARCO: 4, ABRIL: 8, MAIO: 13, JULHO: 18,
        AGOSTO: 21, SETEMBRO: 25, OUTUBRO: 28, NOVEMBRO: 33,
        '1_TURNO': 0, '2_TURNO': 19,
      };
      const allowed = new Set(['1_TURNO', '2_TURNO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO']);
      if (season !== 2026 || !allowed.has(period)) return json({ error: 'Período inválido ou inativo para fechamento.' }, 400);
      let baselineRound = baselines[period] ?? null;
      if (period === 'DEZEMBRO') {
        const { data: november, error: novemberError } = await admin.from('league_closed_periods')
          .select('final_round').eq('season_year', season).eq('period_key', 'NOVEMBRO').maybeSingle();
        if (novemberError) throw new Error(`Falha ao consultar fechamento de novembro: ${novemberError.message}`);
        baselineRound = november?.final_round ?? null;
      }
      const latest = await ensureMarket();
      const finalRound = period === '1_TURNO' ? 19 : latest;
      if (baselineRound === null || baselineRound >= finalRound) {
        return json({ error: 'Não foi possível determinar os limites do período. Verifique o fechamento do mês anterior.' }, 409);
      }
      const { data: snapshot, error: snapshotError } = await admin.from('classic_league_round_snapshots')
        .select('id,status,expected_team_count,received_team_count')
        .eq('season_year', season).eq('round_number', finalRound).maybeSingle();
      if (snapshotError) throw new Error(`Falha ao consultar snapshot final: ${snapshotError.message}`);
      if (!snapshot || snapshot.status !== 'complete' || snapshot.expected_team_count !== 60 || snapshot.received_team_count !== 60) {
        return json({ error: `Antes de fechar, gere e valide o snapshot completo da rodada ${finalRound} (60 participantes).` }, 409);
      }
      const { error: closeError } = await admin.from('league_closed_periods').upsert({
        period_key: period, season_year: season, closed_by: userId,
        baseline_round: baselineRound, final_round: finalRound, snapshot_id: snapshot.id,
        closure_source: 'manual_override', updated_at: new Date().toISOString(),
      }, { onConflict: 'period_key,season_year' });
      if (closeError) throw new Error(`Falha ao registrar fechamento: ${closeError.message}`);
      return json({ ok: true, closed: true, period, baseline_round: baselineRound, final_round: finalRound, snapshot_id: snapshot.id });
    }

    // Publicação genérica dos rankings calculados a partir de snapshots.
    if (url.searchParams.get('action') === 'publish_period') {
      const period = String(url.searchParams.get('periodo') ?? '').toUpperCase();
      const allowed = new Set(['ANUAL', '1_TURNO', '2_TURNO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO']);
      if (season !== 2026 || !allowed.has(period)) {
        return json({ error: 'Período inválido para publicação da Liga Clássica 2026.' }, 400);
      }

      const { data: closedPeriod, error: closedError } = await admin
        .from('league_closed_periods')
        .select('baseline_round,final_round,snapshot_id')
        .eq('season_year', season)
        .eq('period_key', period)
        .maybeSingle();
      if (closedError) throw new Error(`Falha ao consultar fechamento: ${closedError.message}`);
      if (cronAuthorized && closedPeriod?.final_round !== null && closedPeriod?.final_round !== undefined) {
        return json({ ok: true, skipped: true, reason: 'PERIOD_CLOSED', season, period });
      }

      if (cronAuthorized && !['ANUAL', '1_TURNO', '2_TURNO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'].includes(period)) {
        return json({ error: 'Período não permitido para publicação automática.' }, 400);
      }

      const monthlyBaseline: Record<string, number> = {
        FEVEREIRO: 0, MARCO: 4, ABRIL: 8, MAIO: 13,
        JULHO: 18, AGOSTO: 21, SETEMBRO: 25, OUTUBRO: 28, NOVEMBRO: 33,
      };
      let baselineRound: number | null = null;
      let finalRound: number;

      if (period === 'ANUAL') {
        baselineRound = null;
      } else if (period === '1_TURNO') {
        baselineRound = 0;
        finalRound = 19;
      } else if (period === '2_TURNO') {
        baselineRound = 19;
      } else {
        baselineRound = closedPeriod?.baseline_round ?? monthlyBaseline[period] ?? null;
        if (period === 'DEZEMBRO' && baselineRound === null) {
          const { data: november, error: novemberError } = await admin
            .from('league_closed_periods')
            .select('final_round')
            .eq('season_year', season)
            .eq('period_key', 'NOVEMBRO')
            .maybeSingle();
          if (novemberError) throw new Error(`Falha ao consultar fechamento de novembro: ${novemberError.message}`);
          baselineRound = november?.final_round ?? null;
        }
      }

      // Períodos fechados usam os snapshots registrados e não dependem do mercado atual.
      const isClosedWithFinalRound = closedPeriod?.final_round !== null && closedPeriod?.final_round !== undefined;
      if (isClosedWithFinalRound) {
        finalRound = closedPeriod.final_round;
        if (closedPeriod.baseline_round !== null) baselineRound = closedPeriod.baseline_round;
      }
      if (period === '1_TURNO' && !isClosedWithFinalRound) finalRound = 19;
      if (!isClosedWithFinalRound && period !== '1_TURNO') finalRound = await ensureMarket();
      if (baselineRound !== null && (!Number.isInteger(baselineRound) || baselineRound < 0 || baselineRound >= finalRound)) {
        return json({ error: `Limites inválidos para ${period}: base ${baselineRound}, final ${finalRound}.` }, 400);
      }
      if (!isClosedWithFinalRound && latestCompletedRound !== null && finalRound > latestCompletedRound) {
        return json({ error: `A rodada final ${finalRound} ainda não está concluída.` }, 409);
      }

      const requiredRounds = baselineRound === null ? [finalRound] : [baselineRound, finalRound].filter((round) => round > 0);
      const { data: snapshots, error: snapshotsError } = await admin
        .from('classic_league_round_snapshots')
        .select('id,round_number,status,expected_team_count,received_team_count')
        .eq('season_year', season)
        .in('round_number', requiredRounds);
      if (snapshotsError) throw new Error(`Falha ao consultar snapshots: ${snapshotsError.message}`);
      const findSnapshot = (round: number) => snapshots?.find((snapshot) => snapshot.round_number === round);
      const finalSnapshot = findSnapshot(finalRound);
      if (!finalSnapshot || finalSnapshot.status !== 'complete' ||
          finalSnapshot.expected_team_count !== 60 || finalSnapshot.received_team_count !== 60) {
        return json({ error: `Snapshot final da rodada ${finalRound} não está completo com 60 participantes.` }, 409);
      }
      const baselineSnapshot = baselineRound && baselineRound > 0 ? findSnapshot(baselineRound) : null;
      if (baselineRound && baselineRound > 0 &&
          (!baselineSnapshot || baselineSnapshot.status !== 'complete' ||
           baselineSnapshot.expected_team_count !== 60 || baselineSnapshot.received_team_count !== 60)) {
        return json({ error: `Snapshot-base da rodada ${baselineRound} não está completo com 60 participantes.` }, 409);
      }

      const snapshotIds = [finalSnapshot.id, ...(baselineSnapshot ? [baselineSnapshot.id] : [])];
      const { data: points, error: pointsError } = await admin
        .from('classic_league_team_round_points')
        .select('cartola_team_id,team_name,badge_url,points_championship,snapshot_id')
        .in('snapshot_id', snapshotIds);
      if (pointsError) throw new Error(`Falha ao carregar pontuações: ${pointsError.message}`);
      const finalRows = points?.filter((point) => point.snapshot_id === finalSnapshot.id) ?? [];
      const baseRows = baselineSnapshot ? points?.filter((point) => point.snapshot_id === baselineSnapshot.id) ?? [] : [];
      if (finalRows.length !== 60 || (baselineSnapshot && baseRows.length !== 60)) {
        return json({ error: 'Os snapshots não contêm exatamente 60 pontuações.' }, 409);
      }
      const baseByTeam = new Map(baseRows.map((point) => [String(point.cartola_team_id), Number(point.points_championship)]));
      const finalIds = new Set(finalRows.map((point) => String(point.cartola_team_id)));
      if (finalIds.size !== 60 || (baselineSnapshot &&
          (baseByTeam.size !== 60 || [...baseByTeam.keys()].some((id) => !finalIds.has(id))))) {
        return json({ error: 'Os participantes dos snapshots não correspondem integralmente.' }, 409);
      }

      const rankings = finalRows.map((point) => {
        const accumulated = Number(point.points_championship);
        const previous = baselineSnapshot ? baseByTeam.get(String(point.cartola_team_id)) : 0;
        const total = accumulated - (previous ?? 0);
        if (!Number.isFinite(accumulated) || previous === undefined && baselineSnapshot ||
            !Number.isFinite(total) || total < 0) {
          throw new Error(`Pontuação inválida para o time ${point.team_name}.`);
        }
        return {
          badge: point.badge_url ?? '',
          total: total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          position: '',
          teamName: point.team_name,
          sortPoints: total,
        };
      }).sort((a, b) => b.sortPoints - a.sortPoints);

      const title = period === 'ANUAL' ? 'RANKING ANUAL' : period.includes('TURNO') ? 'RANKING DO TURNO' : 'RANKING MENSAL';
      const publishedData = {
        title,
        rankings: rankings.map(({ sortPoints: _sortPoints, ...row }, index) => ({ ...row, position: String(index + 1) })),
      };
      const { error: publishError } = await admin.from('sheets_cache').upsert({
        cache_key: `ranking_liga:${period}`, type: 'classificacao', data: publishedData,
        synced_at: new Date().toISOString(), synced_by: userId,
      }, { onConflict: 'cache_key' });
      if (publishError) throw new Error(`Falha ao publicar ranking de ${period}: ${publishError.message}`);

      return json({
        ok: true, published: true, season, period, baseline_round: baselineRound,
        final_round: finalRound, participant_count: publishedData.rankings.length,
        total_points: rankings.reduce((sum, row) => sum + row.sortPoints, 0),
      });
    }


    if (action === 'cron_snapshot' && !cronAuthorized) return json({ error: 'Não autorizado.' }, 401);
    const latest = await ensureMarket();
    const targetRound = requestedRound ?? latest;

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
          market_round: market!.rodada_atual, market_status: market!.status_mercado,
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
          market_round: market.rodada_atual, market_status: market!.status_mercado,
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
          metadata: { requested_by: userId, market_round: market!.rodada_atual, market_status: market!.status_mercado },
        })
        .eq('id', snapshotId)
        .eq('status', 'in_progress')
        .select('id')
        .maybeSingle();
      if (completeError) throw new Error(`Falha ao concluir snapshot: ${completeError.message}`);
      if (!completed?.id) throw new Error('Snapshot não pôde ser marcado como completo; estado foi alterado durante a sincronização.');

      return json({
        ok: true, season, round: targetRound, market_round: market!.rodada_atual,
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
