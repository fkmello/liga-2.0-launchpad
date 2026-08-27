import type { ActiveSync, ProviderId, SourceType } from '../sync/providers.ts';
import type { StandingsPresetId } from '../standings/presets.ts';
import type { MatchInput } from '../standings/types.ts';

export type SyncScope =
  | { kind: 'all' }
  | { kind: 'dados_externos' }
  | { kind: 'rodada'; rodada: number }
  | { kind: 'fase'; fase: string };

export interface AdapterContext {
  league: string;
  season: number;
  scope: SyncScope;
  /** Utilitário de rede com timeout/retry — adapters nunca acessam Supabase. */
  fetchJson: (url: string, init?: RequestInit) => Promise<unknown>;
  /** Conteúdo atual do cache, injetado pelo pipeline (adapters não leem o banco). */
  previous?: {
    fases: Record<string, unknown>;
    classificacao: { grupos: Record<string, unknown[]> };
    dados_externos: { rows: unknown[] };
  } | null;
}

export interface TournamentAdapter<Raw = unknown> {
  id: string;
  provider: ProviderId;
  source_type: SourceType;
  fetchRaw(ctx: AdapterContext): Promise<Raw>;
  toFases?(raw: Raw, ctx: AdapterContext): Record<string, unknown>;
  toClassificacao?(raw: Raw, ctx: AdapterContext): { grupos: Record<string, unknown[]> };
  toDadosExternos?(raw: Raw, ctx: AdapterContext): { rows: unknown[] };
  toMatches?(raw: Raw, ctx: AdapterContext): MatchInput[];
}

export type PersistMode = 'shadow' | 'official';

/**
 * Configuração do dispatcher automático. A origem do status de mercado é
 * definida aqui (Registry = única fonte de verdade); o dispatcher é genérico.
 */
export interface TournamentCronConfig {
  enabled: boolean;
  statusProvider: string;
  /** Atraso mínimo, após detectar mercado aberto, para a Sync #1. Padrão 15. */
  firstSyncDelayMinutes?: number;
  /** Limite superior da janela da Sync #1 (documental). Padrão 30. */
  firstSyncWindowMinutes?: number;
  /** Atraso da Sync #2 contado a partir de first_sync_at. Padrão 60. */
  secondSyncDelayMinutes?: number;
}

export interface TournamentDefinition {
  league: string;
  currentSeason: number;
  /** Feature flag: fonte oficial de sincronização do torneio. */
  activeSync: ActiveSync;
  /**
   * Destino de escrita do pipeline. Definido EXCLUSIVAMENTE aqui — nunca por
   * query string. 'shadow' torna impossível tocar o cache oficial.
   */
  persistMode: PersistMode;
  cacheKey: (season: number) => string;

  cacheType: string;
  version: number;
  schema_version: number;
  standingsPreset: StandingsPresetId;
  /** Chaves que sofrem merge incremental em vez de substituição. */
  mergeableKeys: string[];
  adapters: TournamentAdapter[];
  /** Precedência entre adapters quando `activeSync = 'hybrid'` (maior vence). */
  adapterPrecedence?: Record<string, number>;
  /** Configuração do cron dispatcher. Ausente/desabilitado = nunca automatizado. */
  cron?: TournamentCronConfig;
}

export interface TournamentMetadata {
  provider: ProviderId;
  source_type: SourceType;
  league: string;
  season: number;
  schema_version: number;
  hash: string;
  generated_at: string;
}

export interface TournamentCachePayload {
  version: number;
  synced_at: string;
  fases: Record<string, unknown>;
  classificacao: { grupos: Record<string, unknown[]> };
  dados_externos: { rows: unknown[] };
  metadata?: TournamentMetadata;
}
