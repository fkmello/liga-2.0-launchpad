import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchJsonWithRetry } from '../_shared/sync/http.ts';

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
const EXPECTED_TEAMS = 60;
const MAX_CONCURRENCY = 8;
const SEASON_MIN = 2000;
const SEASON_MAX = 2100;

type MarketStatus = { status_mercado: number; rodada_atual: number };
type RosterTeam = { id: string; name: string; badge: string | null };
type CartolaTeam = {
  pontos_campeonato?: number;
  time?: { nome?: string; url_escudo_svg?: string };
};

function resolveCompletedRound(market: MarketStatus): number {
  const status = Number(market.status_mercado);
  const currentRound = Number(market.rodada_atual);
  if (!Number.isInteger(currentRound) || currentRound < 1 || currentRound > 38) {
    throw new Error('Rodada atual retornada pela API Cartola é inválida.');
  }
  // A rodada 38 é exceção: após o encerramento definitivo não existe R39
  // para disparar a sincronização convencional.
  if (status === 6 && currentRound === 38) return 38;
  if (status === 1 && currentRound > 1) return currentRound - 1;
  if (status === 1 && currentRound === 1) {
    throw new Error('Ainda não existe rodada concluída nesta temporada.');
  }
  if (status === 2) throw new Error('Mercado fechado; não há confirmação segura de rodada concluída.');
  if (status === 4) throw new Error('Mercado em manutenção; sincronização bloqueada.');
  if (status === 6) throw new Error('Temporada finalizada sem confirmação da rodada 38.');
  throw new Error(`Status de mercado não elegível para sincronização: ${status}.`);
}

function parseRoster(data: unknown): RosterTeam[] {
  const root = (data ?? {}) as { raw?: unknown };
  if (!Array.isArray(root.raw)) throw new Error('Cache dados_externos:liga_classica sem campo raw válido.');
  const teams: RosterTeam[] = [];
  for (const row of root.raw as unknown[][]) {
    if (!Array.isArray(row)) continue;
    const id = String(row[3] ?? '').trim();
    const name = String(row[2] ?? '').trim();
    if (!/^\d+$/.test(id) || !name) continue;
    teams.push({ id, name, badge: String(row[5] ?? '').trim() || null });
  }
  const unique = new Set(teams.map((team) => team.id));
  if (teams.length !== EXPECTED_TEAMS || unique.size !== EXPECTED_TEAMS) {
    throw new Error(
      `Cadastro da Liga Clássica inválido: esperados ${EXPECTED_TEAMS} times e IDs únicos; encontrados ${teams.length} linhas válidas e ${unique.size} IDs.`,
    );
  }
  return teams;
}

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
    const targetRound = resolveCompletedRound(market);

    const { data: cache, error: cacheError } = await admin
      .from('sheets_cache')
      .select('data')
      .eq('cache_key', 'dados_externos:liga_classica')
      .maybeSingle();
    if (cacheError) throw new Error(`Falha ao carregar participantes: ${cacheError.message}`);
    if (!cache?.data) throw new Error('Cache dados_externos:liga_classica não encontrado.');
    const roster = parseRoster(cache.data);

    const { data: existing, error: existingError } = await admin
      .from('classic_league_round_snapshots')
      .select('id,status,received_team_count')
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
      return json({ error: 'Já existe uma sincronização em andamento para esta rodada.', snapshot_id: existing.id }, 409);
    }

    let snapshotId: string;
    if (existing?.id) {
      snapshotId = existing.id;
      const { error: resetError } = await admin
        .from('classic_league_round_snapshots')
        .update({
          status: 'in_progress', source: 'cartola_api',
          source_endpoint: `${API}/time/id/{id}/${targetRound}`,
          market_round: market.rodada_atual, market_status: market.status_mercado,
          expected_team_count: EXPECTED_TEAMS, received_team_count: 0,
          requested_at: new Date().toISOString(), completed_at: null, error_message: null,
          metadata: { retried: true },
        })
        .eq('id', snapshotId);
      if (resetError) throw new Error(`Falha ao reiniciar snapshot: ${resetError.message}`);
      const { error: deleteError } = await admin
        .from('classic_league_team_round_points').delete().eq('snapshot_id', snapshotId);
      if (deleteError) throw new Error(`Falha ao limpar pontos de tentativa anterior: ${deleteError.message}`);
    } else {
      const { data: created, error: createError } = await admin
        .from('classic_league_round_snapshots')
        .insert({
          season_year: season, round_number: targetRound, source: 'cartola_api',
          source_endpoint: `${API}/time/id/{id}/${targetRound}`,
          market_round: market.rodada_atual, market_status: market.status_mercado,
          status: 'in_progress', expected_team_count: EXPECTED_TEAMS,
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
      if (points.length !== EXPECTED_TEAMS || new Set(points.map((p) => p.cartola_team_id)).size !== EXPECTED_TEAMS) {
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
        market_status: market.status_mercado, expected_team_count: EXPECTED_TEAMS,
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
