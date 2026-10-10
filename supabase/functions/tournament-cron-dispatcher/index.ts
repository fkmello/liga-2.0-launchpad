import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { listTournaments, resolveDefinition } from '../_shared/tournament/registry.ts';
import { resolveStatusProvider } from '../_shared/tournament/statusProviders.ts';

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

const TABLE = 'tournament_sync_state';

const MARKET_OPEN = 1;
const MARKET_CLOSED = 2;
const MARKET_MAINTENANCE = 4;
const MARKET_FINISHED = 6;

type Decision =
  | 'SKIP_MAINTENANCE'
  | 'SKIP_CLOSED'
  | 'MARKET_OPENED'
  | 'WAIT_WINDOW'
  | 'SYNC_1'
  | 'SYNC_2'
  | 'SKIP_DONE'
  | 'PROVIDER_ERROR'
  | 'SYNC_ERROR';

interface SyncState {
  id: string;
  league: string;
  season: number;
  current_round: number | null;
  market_status: number | null;
  market_opened_at: string | null;
  synced_round: number | null;
  first_sync_at: string | null;
  second_sync_done: boolean;
  last_sync_status: string | null;
  last_sync_phase: string;
  last_error: string | null;
  last_error_at: string | null;
}

const summarizeError = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 500);

const minutesSince = (iso: string | null): number | null =>
  iso === null ? null : (Date.now() - new Date(iso).getTime()) / 60000;

// deno-lint-ignore no-explicit-any
type Db = any;

async function loadOrCreateState(db: Db, league: string, season: number): Promise<SyncState> {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('league', league)
    .eq('season', season)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar estado: ${error.message}`);
  if (data) return data as SyncState;

  const { data: created, error: insertError } = await db
    .from(TABLE)
    .insert({ league, season })
    .select('*')
    .single();
  if (insertError) throw new Error(`Falha ao criar estado: ${insertError.message}`);
  return created as SyncState;
}

async function patchState(db: Db, id: string, patch: Record<string, unknown>) {
  const { error } = await db.from(TABLE).update(patch).eq('id', id);
  if (error) console.error('[cron-dispatcher] falha ao gravar estado:', error.message);
}

async function callSync(baseUrl: string, secret: string, league: string, season: number) {
  const url =
    `${baseUrl}/functions/v1/sync-tournament-api` +
    `?league=${encodeURIComponent(league)}&season=${season}&persist=true`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sync-secret': secret },
  });

  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (!res.ok || body.ok !== true) {
    const detail = String(body.error ?? body.errors ?? `HTTP ${res.status}`);
    throw new Error(`sync-tournament-api: ${detail}`);
  }
  return body;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Secret usado para chamar a sync-tournament-api (inalterado).
  const cronSecret =
    Deno.env.get('TOURNAMENT_SYNC_SECRET_V2') ?? Deno.env.get('TOURNAMENT_SYNC_SECRET');
  // Secret que autentica o próprio dispatcher (usado pelo pg_cron).
  const dispatcherSecret = Deno.env.get('TOURNAMENT_CRON_SECRET') ?? cronSecret;
  const provided = req.headers.get('x-sync-secret');
  if (!dispatcherSecret || !provided || provided !== dispatcherSecret) {
    return json({ error: 'Não autorizado' }, 401);
  }
  if (!cronSecret) return json({ error: 'Secret de sincronização ausente' }, 500);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const results: Record<string, unknown>[] = [];

  for (const league of listTournaments()) {
    const { def, season } = resolveDefinition(league);
    if (!def.cron?.enabled) continue;

    const firstDelay = def.cron.firstSyncDelayMinutes ?? 15;
    const secondDelay = def.cron.secondSyncDelayMinutes ?? 60;

    let state: SyncState;
    try {
      // Estado carregado ANTES de qualquer chamada externa, para que uma falha
      // do provider ainda possa registrar observabilidade.
      state = await loadOrCreateState(db, league, season);
    } catch (e) {
      console.error('[cron-dispatcher] estado indisponível', league, summarizeError(e));
      results.push({ league, season, decision: 'PROVIDER_ERROR', error: summarizeError(e) });
      continue;
    }

    const fail = async (decision: Decision, e: unknown) => {
      const message = summarizeError(e);
      await patchState(db, state.id, {
        last_sync_status: 'FAILED',
        last_error: message,
        last_error_at: new Date().toISOString(),
      });
      results.push({
        league,
        season,
        decision,
        current_round: state.current_round,
        market_status: state.market_status,
        persisted: false,
        last_sync_status: 'FAILED',
        last_sync_phase: state.last_sync_phase,
        error: message,
      });
    };

    let status: number;
    let round: number;
    try {
      const provider = resolveStatusProvider(def.cron.statusProvider);
      const market = await provider.getMarketStatus(season);
      status = market.status_mercado;
      round = market.rodada_atual;
    } catch (e) {
      await fail('PROVIDER_ERROR', e);
      continue;
    }

    const push = (decision: Decision, extra: Record<string, unknown> = {}) =>
      results.push({
        league,
        season,
        decision,
        current_round: round,
        market_status: status,
        persisted: false,
        last_sync_status: 'SKIPPED',
        last_sync_phase: state.last_sync_phase,
        error: null,
        ...extra,
      });

    // ── Manutenção / encerrado: nenhuma decisão ──
    if (status === MARKET_MAINTENANCE || status === MARKET_FINISHED) {
      await patchState(db, state.id, { market_status: status, last_sync_status: 'SKIPPED' });
      push('SKIP_MAINTENANCE');
      continue;
    }

    // ── Mercado fechado: reset completo dos campos transitórios da rodada ──
    if (status === MARKET_CLOSED) {
      await patchState(db, state.id, {
        market_status: status,
        current_round: round,
        market_opened_at: null,
        first_sync_at: null,
        second_sync_done: false,
        last_sync_phase: 'NONE',
        last_sync_status: 'SKIPPED',
      });
      push('SKIP_CLOSED', { last_sync_phase: 'NONE' });
      continue;
    }

    if (status !== MARKET_OPEN) {
      await patchState(db, state.id, { market_status: status, last_sync_status: 'SKIPPED' });
      push('SKIP_DONE');
      continue;
    }

    // ── Mercado aberto ──
    const roundChanged = state.current_round !== round;
    const alreadySynced = state.synced_round === round;

    if (!alreadySynced) {
      if (roundChanged || !state.market_opened_at) {
        await patchState(db, state.id, {
          market_status: status,
          current_round: round,
          market_opened_at: new Date().toISOString(),
          first_sync_at: null,
          second_sync_done: false,
          last_sync_phase: 'NONE',
          last_sync_status: 'SKIPPED',
        });
        push('MARKET_OPENED', { last_sync_phase: 'NONE' });
        continue;
      }

      const elapsed = minutesSince(state.market_opened_at) ?? 0;
      if (elapsed < firstDelay) {
        await patchState(db, state.id, { market_status: status, last_sync_status: 'SKIPPED' });
        push('WAIT_WINDOW');
        continue;
      }

      let syncResult: Record<string, unknown>;
      try {
        syncResult = await callSync(supabaseUrl, cronSecret, league, season);
      } catch (e) {
        await fail('SYNC_ERROR', e);
        continue;
      }
      await patchState(db, state.id, {
        market_status: status,
        current_round: round,
        synced_round: round,
        first_sync_at: new Date().toISOString(),
        second_sync_done: false,
        last_sync_phase: 'SYNC_1',
        last_sync_status: 'SUCCESS',
        last_error: null,
        last_error_at: null,
      });
      push('SYNC_1', {
        persisted: syncResult.persisted === true,
        changed: syncResult.changed === true,
        sync_hash: typeof syncResult.hash === 'string' ? syncResult.hash : null,
        records_processed: typeof syncResult.records_processed === 'number' ? syncResult.records_processed : null,
        last_sync_status: 'SUCCESS',
        last_sync_phase: 'SYNC_1',
      });
      continue;
    }

    // ── Rodada já sincronizada: só resta eventualmente a Sync #2 ──
    const sinceFirst = minutesSince(state.first_sync_at);
    if (!state.second_sync_done && sinceFirst !== null && sinceFirst >= secondDelay) {
      let syncResult: Record<string, unknown>;
      try {
        syncResult = await callSync(supabaseUrl, cronSecret, league, season);
      } catch (e) {
        await fail('SYNC_ERROR', e);
        continue;
      }
      await patchState(db, state.id, {
        market_status: status,
        current_round: round,
        second_sync_done: true,
        last_sync_phase: 'SYNC_2',
        last_sync_status: 'SUCCESS',
        last_error: null,
        last_error_at: null,
      });
      push('SYNC_2', {
        persisted: syncResult.persisted === true,
        changed: syncResult.changed === true,
        sync_hash: typeof syncResult.hash === 'string' ? syncResult.hash : null,
        records_processed: typeof syncResult.records_processed === 'number' ? syncResult.records_processed : null,
        last_sync_status: 'SUCCESS',
        last_sync_phase: 'SYNC_2',
      });
      continue;
    }

    await patchState(db, state.id, {
      market_status: status,
      current_round: round,
      last_sync_status: 'SKIPPED',
    });
    push('SKIP_DONE');
  }

  console.log('[cron-dispatcher]', JSON.stringify({ at: new Date().toISOString(), results }));
  return json({ ok: true, results });
});
