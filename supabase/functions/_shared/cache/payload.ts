import { hashPayloadContent } from './hash.ts';
import type {
  TournamentCachePayload,
  TournamentDefinition,
  TournamentMetadata,
} from '../tournament/types.ts';
import { KnownProviders } from '../sync/providers.ts';

export interface NormalizedTournamentData {
  fases: Record<string, unknown>;
  classificacao: { grupos: Record<string, unknown[]> };
  dados_externos: { rows: unknown[] };
}

/** Defaults para payloads antigos (gravados pela planilha, sem `metadata`). */
export function readMetadata(
  payload: TournamentCachePayload | null,
  def: TournamentDefinition,
  season: number,
): TournamentMetadata {
  return (
    payload?.metadata ?? {
      provider: KnownProviders.GOOGLE_SHEETS,
      source_type: 'sheet',
      league: def.league,
      season,
      schema_version: 1,
      hash: '',
      generated_at: payload?.synced_at ?? new Date().toISOString(),
    }
  );
}

export async function buildTournamentPayload(
  def: TournamentDefinition,
  season: number,
  data: NormalizedTournamentData,
  meta: Pick<TournamentMetadata, 'provider' | 'source_type'>,
): Promise<TournamentCachePayload> {
  const hash = await hashPayloadContent(data);
  const now = new Date().toISOString();
  return {
    version: def.version,
    synced_at: now,
    fases: data.fases,
    classificacao: data.classificacao,
    dados_externos: data.dados_externos,
    metadata: {
      provider: meta.provider,
      source_type: meta.source_type,
      league: def.league,
      season,
      schema_version: def.schema_version,
      hash,
      generated_at: now,
    },
  };
}

/** Merge incremental por escopo, respeitando `def.mergeableKeys` (dot paths). */
export function mergeTournamentPayload(
  def: TournamentDefinition,
  prev: TournamentCachePayload | null,
  next: TournamentCachePayload,
): TournamentCachePayload {
  if (!prev) return next;
  const merged: TournamentCachePayload = {
    ...next,
    fases: { ...(prev.fases ?? {}), ...(next.fases ?? {}) },
    classificacao: hasContent(next.classificacao?.grupos) ? next.classificacao : prev.classificacao,
    dados_externos: (next.dados_externos?.rows ?? []).length
      ? next.dados_externos
      : prev.dados_externos,
  };
  for (const path of def.mergeableKeys) {
    const [root, child] = path.split('.');
    if (root !== 'fases' || !child) continue;
    const prevChild = (prev.fases as any)?.[child];
    const nextChild = (next.fases as any)?.[child];
    if (prevChild || nextChild) {
      (merged.fases as any)[child] = { ...(prevChild ?? {}), ...(nextChild ?? {}) };
    }
  }
  return merged;
}

function hasContent(grupos?: Record<string, unknown[]>): boolean {
  return !!grupos && Object.keys(grupos).length > 0;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Impede gravação de payload degenerado (vazio / estrutura inválida). */
export function validateTournamentPayload(
  payload: TournamentCachePayload,
  def: TournamentDefinition,
): ValidationResult {
  const errors: string[] = [];
  if (payload.version !== def.version) errors.push(`version esperada ${def.version}`);
  if (!payload.fases || typeof payload.fases !== 'object') errors.push('fases ausente');
  if (!payload.classificacao?.grupos) errors.push('classificacao.grupos ausente');
  if (!Array.isArray(payload.dados_externos?.rows)) errors.push('dados_externos.rows ausente');
  const empty =
    Object.keys(payload.fases ?? {}).length === 0 &&
    Object.keys(payload.classificacao?.grupos ?? {}).length === 0 &&
    (payload.dados_externos?.rows ?? []).length === 0;
  if (empty) errors.push('payload totalmente vazio');
  return { valid: errors.length === 0, errors };
}
