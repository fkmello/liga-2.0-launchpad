import { stableStringify } from './hash.ts';
import type { TournamentCachePayload } from '../tournament/types.ts';

export interface CacheComparison {
  changed: boolean;
  diff: Record<string, { from: string; to: string }>;
}

export interface CacheDiffOptions {
  /** Enables semantic comparison only for the named tournament and only in audit mode. */
  league?: string;
  semantic?: boolean;
}

const SECTIONS = ['fases', 'classificacao', 'dados_externos'] as const;

export function diffPayloads(
  current: TournamentCachePayload | null,
  next: TournamentCachePayload,
  options: CacheDiffOptions = {},
): CacheComparison {
  const diff: Record<string, { from: string; to: string }> = {};
  for (const section of SECTIONS) {
    let a: string;
    let b: string;

    if (
      section === 'dados_externos' &&
      options.semantic === true &&
      options.league === 'copa_brasil'
    ) {
      const semanticCurrent = canonicalCopaBrasilTeams(current?.dados_externos);
      const semanticNext = canonicalCopaBrasilTeams(next.dados_externos);
      // If either shape cannot be safely interpreted, fall back to strict comparison.
      a = semanticCurrent ?? stableStringify(current?.[section] ?? null);
      b = semanticNext ?? stableStringify(next[section]);
    } else {
      a = stableStringify(current?.[section] ?? null);
      b = stableStringify(next[section]);
    }

    if (a !== b) diff[section] = { from: summarize(a), to: summarize(b) };
  }
  return { changed: Object.keys(diff).length > 0, diff };
}

/**
 * Copa do Brasil audit only: compare team identity (name + Cartola ID),
 * ignoring legacy/new container shape and shield URL differences.
 * Returns null for unrecognized/empty data so the caller uses strict comparison.
 */
function canonicalCopaBrasilTeams(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;

  const section = value as { rows?: unknown; raw?: unknown };
  let candidateRows: unknown;
  if (Array.isArray(section.rows)) {
    candidateRows = section.rows;
  } else if (Array.isArray(section.raw)) {
    candidateRows = section.raw;
  } else {
    return null;
  }

  const teams: Array<{ id: string; name: string }> = [];
  for (const item of candidateRows as unknown[]) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const name = String(item[0] ?? '').trim().replace(/\s+/g, ' ');
    const id = String(item[1] ?? '').trim();
    // The legacy raw matrix may include a header row.
    if (!name && id.toLowerCase() === 'id') continue;
    if (!name || !id || id.toLowerCase() === 'id') continue;
    teams.push({ id, name });
  }

  if (teams.length === 0) return null;
  teams.sort((a, b) => a.id.localeCompare(b.id) || a.name.localeCompare(b.name));
  return stableStringify(teams);
}

function summarize(s: string): string {
  return s.length > 300 ? `${s.slice(0, 300)}… (${s.length} chars)` : s;
}
