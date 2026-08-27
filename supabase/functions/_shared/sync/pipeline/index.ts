import { fetchStep } from './fetch.ts';
import { normalizeTournamentData } from './normalize.ts';
import { standingsStep } from './standings.ts';
import { logSync } from './log.ts';
import { fetchJsonWithRetry } from '../http.ts';
import { selectAdapters } from '../../tournament/registry.ts';
import {
  buildTournamentPayload,
  mergeTournamentPayload,
  validateTournamentPayload,
} from '../../cache/payload.ts';
import { diffPayloads } from '../../cache/diff.ts';
import { resolveCompareStatus, type CompareStatus } from '../../cache/compareStatus.ts';
import { buildCoverageReport, type CoverageReport } from '../validation/coverage.ts';
import { diffStandings, type StandingsDivergence } from '../validation/standingsDiff.ts';
import type { CacheRepository } from '../../cache/repository.ts';
import type {
  AdapterContext,
  SyncScope,
  TournamentCachePayload,
  TournamentDefinition,
} from '../../tournament/types.ts';

export class NoEligibleAdapterError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = 'NoEligibleAdapterError';
  }
}

export interface PipelineOptions {
  dryRun?: boolean;
  compare?: boolean;
  /** Gravação só acontece com `persist === true` explícito. */
  persist?: boolean;
  syncedBy: string | null;
  authMode?: 'secret' | 'admin';
}


export interface PipelineResult {
  league: string;
  season: number;
  cache_key: string;
  active_sync: string;
  adapters: string[];
  payload: TournamentCachePayload | null;
  current?: TournamentCachePayload | null;
  diff?: Record<string, { from: string; to: string }>;
  identical: boolean;
  compare_status: CompareStatus;
  differences_count: number;
  fields_differing: string[];
  hash_atual: string;
  hash_novo: string;
  coverage: CoverageReport;
  standings_divergences: StandingsDivergence[];
  changed: boolean;
  persisted: boolean;
  errors: string[];
}


export async function runPipeline(
  def: TournamentDefinition,
  season: number,
  scope: SyncScope,
  repo: CacheRepository,
  opts: PipelineOptions,
): Promise<PipelineResult> {
  const started = Date.now();
  const steps: Record<string, number> = {};
  const mark = (name: string, from: number) => {
    steps[name] = Date.now() - from;
  };

  const cacheKey = def.cacheKey(season);
  const adapters = selectAdapters(def);
  const base: PipelineResult = {
    league: def.league,
    season,
    cache_key: cacheKey,
    active_sync: def.activeSync,
    adapters: adapters.map((a) => a.id),
    payload: null,
    identical: true,
    compare_status: 'MATCH',
    differences_count: 0,
    fields_differing: [],
    hash_atual: '',
    hash_novo: '',
    coverage: {
      teams_expected: 0,
      teams_loaded: 0,
      matches_expected: 0,
      matches_loaded: 0,
      standings_expected: 0,
      standings_generated: 0,
      missing_teams: [],
      missing_matches: [],
    },
    standings_divergences: [],
    changed: false,
    persisted: false,
    errors: [],


  };

  if (!adapters.length) {
    throw new NoEligibleAdapterError(
      `Nenhum adapter elegível para league='${def.league}' (activeSync='${def.activeSync}')`,
    );
  }


  let t = Date.now();
  const current = await repo.load(cacheKey);
  mark('load', t);

  const ctx: AdapterContext = {
    league: def.league,
    season,
    scope,
    fetchJson: fetchJsonWithRetry,
    previous: current
      ? {
          fases: current.fases ?? {},
          classificacao: current.classificacao ?? { grupos: {} },
          dados_externos: current.dados_externos ?? { rows: [] },
        }
      : null,
  };

  t = Date.now();
  const raws = await fetchStep(adapters, ctx);
  mark('fetch', t);

  t = Date.now();
  const normalized = normalizeTournamentData(adapters, raws, ctx);
  mark('normalize', t);

  t = Date.now();
  const grupos = standingsStep(def, normalized.matches);
  mark('standings', t);
  const classificacao = Object.keys(grupos).length
    ? { grupos: grupos as unknown as Record<string, unknown[]> }
    : normalized.classificacao;

  t = Date.now();
  const primary = adapters[0];
  let payload = await buildTournamentPayload(
    def,
    season,
    { fases: normalized.fases, classificacao, dados_externos: normalized.dados_externos },
    { provider: primary.provider, source_type: primary.source_type },
  );
  payload = mergeTournamentPayload(def, current, payload);
  mark('buildPayload', t);

  const validation = validateTournamentPayload(payload, def);
  if (!validation.valid) base.errors.push(...validation.errors);

  const comparison = diffPayloads(current, payload);
  const fields = Object.keys(comparison.diff);
  const status = resolveCompareStatus(fields);

  base.payload = payload;
  base.changed = comparison.changed;
  base.diff = comparison.diff;
  base.identical = !comparison.changed;
  base.compare_status = status.status;
  base.differences_count = fields.length;
  base.fields_differing = fields;
  base.hash_atual = current?.metadata?.hash ?? '';
  base.hash_novo = payload.metadata?.hash ?? '';
  base.coverage = buildCoverageReport({
    baseline: current,
    generated: payload,
    matches: normalized.matches,
    standings: grupos,
  });
  base.standings_divergences = diffStandings(current, grupos);

  // Auditoria: 'classificacao' difere estruturalmente (matriz da planilha vs
  // objeto calculado). Sem divergências funcionais, isso não é um erro.
  if (base.standings_divergences.length === 0 && fields.includes('classificacao')) {
    const structural = resolveCompareStatus(fields.filter((f) => f !== 'classificacao'));
    base.compare_status = structural.status;
  }
  if (opts.compare) base.current = current;

  const canPersist = validation.valid && opts.persist === true && !opts.dryRun && !opts.compare;
  if (canPersist) {
    t = Date.now();
    const saved = await repo.save(cacheKey, payload, { type: def.cacheType, syncedBy: opts.syncedBy });
    mark('persist', t);
    base.persisted = saved.changed;
  }


  logSync({
    league: def.league,
    season,
    provider: primary.provider,
    source_type: primary.source_type,
    active_sync: def.activeSync,
    scope: scope.kind,
    duration_ms: Date.now() - started,
    records_processed: normalized.matches.length + (normalized.dados_externos.rows?.length ?? 0),
    changed: base.changed,
    hash: payload.metadata?.hash ?? '',
    version: payload.version,
    schema_version: payload.metadata?.schema_version ?? 0,
    grupos: Object.keys(payload.classificacao?.grupos ?? {}).length,
    fases: Object.keys(payload.fases ?? {}).length,
    rows: payload.dados_externos?.rows?.length ?? 0,
    steps,
    persist_mode: def.persistMode ?? 'shadow',
    auth_mode: opts.authMode ?? 'secret',
    cache_key: cacheKey,
    persisted: base.persisted,
  });


  return base;
}
