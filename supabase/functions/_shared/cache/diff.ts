import { stableStringify } from './hash.ts';
import type { TournamentCachePayload } from '../tournament/types.ts';

export interface CacheComparison {
  changed: boolean;
  diff: Record<string, { from: string; to: string }>;
}

const SECTIONS = ['fases', 'classificacao', 'dados_externos'] as const;

export function diffPayloads(
  current: TournamentCachePayload | null,
  next: TournamentCachePayload,
): CacheComparison {
  const diff: Record<string, { from: string; to: string }> = {};
  for (const section of SECTIONS) {
    const a = stableStringify(current?.[section] ?? null);
    const b = stableStringify(next[section]);
    if (a !== b) diff[section] = { from: summarize(a), to: summarize(b) };
  }
  return { changed: Object.keys(diff).length > 0, diff };
}

function summarize(s: string): string {
  return s.length > 300 ? `${s.slice(0, 300)}… (${s.length} chars)` : s;
}
