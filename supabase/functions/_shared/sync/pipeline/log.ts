export interface SyncLogEntry {
  league: string;
  season: number;
  provider: string;
  source_type: string;
  active_sync: string;
  scope: string;
  duration_ms: number;
  records_processed: number;
  changed: boolean;
  hash: string;
  version: number;
  schema_version: number;
  grupos: number;
  fases: number;
  rows: number;
  steps: Record<string, number>;
  persist_mode: string;
  auth_mode: 'secret' | 'admin';
  cache_key: string;
  persisted: boolean;
}


export function logSync(entry: SyncLogEntry): void {
  console.log('[tournament-sync]', JSON.stringify(entry));
}
