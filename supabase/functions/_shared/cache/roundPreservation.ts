/**
 * Preservação de rodadas já consolidadas.
 *
 * A lógica genérica permanece igual para não alterar o comportamento das
 * Séries A, B e C. A Copa do Brasil usa uma mesclagem específica para ida/volta.
 */

type Fase = Record<string, any>;

const SCORE_FIELDS = ['score1', 'score2', 'scoreIda1', 'scoreIda2', 'scoreVolta1', 'scoreVolta2'];

function isFilled(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function legacyScoredMatches(fase: unknown): number {
  const matches = (fase as Fase | undefined)?.matches;
  if (!Array.isArray(matches)) return 0;
  return matches.filter((m: any) => isFilled(m?.score1) && isFilled(m?.score2)).length;
}

/** Quantos confrontos possuem placares completos, incluindo ida/volta da Copa do Brasil. */
export function countScoredMatches(fase: unknown): number {
  const matches = (fase as Fase | undefined)?.matches;
  if (!Array.isArray(matches)) return 0;
  return matches.filter((m: any) => {
    const regular = isFilled(m?.score1) && isFilled(m?.score2);
    const ida = isFilled(m?.scoreIda1) && isFilled(m?.scoreIda2);
    const volta = isFilled(m?.scoreVolta1) && isFilled(m?.scoreVolta2);
    return regular || ida || volta;
  }).length;
}

/** Quantos confrontos a fase possui (com ou sem placar). */
export function countMatches(fase: unknown): number {
  const matches = (fase as Fase | undefined)?.matches;
  return Array.isArray(matches) ? matches.length : 0;
}

/**
 * Mesclagem histórica das Séries A/B/C, mantida sem alteração funcional.
 * Para cada rodada, vence o lado com mais placares; empate usa quantidade de confrontos.
 */
export function mergeFasesPreservingScores(
  prev: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const a = prev ?? {};
  const b = next ?? {};
  const out: Record<string, unknown> = { ...a, ...b };

  for (const key of Object.keys(a)) {
    if (!(key in b)) continue;
    const prevScored = legacyScoredMatches(a[key]);
    const nextScored = legacyScoredMatches(b[key]);
    if (prevScored > nextScored) {
      out[key] = a[key];
      continue;
    }
    if (prevScored === nextScored && countMatches(a[key]) > countMatches(b[key])) {
      out[key] = a[key];
    }
  }
  return out;
}

function copaMatchIdentity(match: Record<string, any>): string | null {
  const normalizeTeam = (value: unknown) => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  const team1 = normalizeTeam(match.team1 ?? match.home);
  const team2 = normalizeTeam(match.team2 ?? match.away);
  if (team1 && team2) return 'teams:' + team1 + '::' + team2;
  const number = String(match.matchNumber ?? match.matchOrder ?? '').trim();
  return number ? 'number:' + number : null;
}

function mergeCopaPhaseMatches(prev: unknown, next: unknown): unknown {
  const prevPhase = prev as Fase | undefined;
  const nextPhase = next as Fase | undefined;
  const prevMatches = prevPhase?.matches;
  const nextMatches = nextPhase?.matches;
  if (!Array.isArray(prevMatches)) return next;
  if (!Array.isArray(nextMatches)) {
    return { ...(prevPhase ?? {}), ...(nextPhase ?? {}), matches: prevMatches };
  }

  const previousByIdentity = new Map<string, Record<string, any>>();
  for (const match of prevMatches as Record<string, any>[]) {
    const identity = copaMatchIdentity(match);
    if (identity) previousByIdentity.set(identity, match);
  }

  const nextIdentities = new Set<string>();
  const mergedMatches = (nextMatches as Record<string, any>[]).map((match) => {
    const identity = copaMatchIdentity(match);
    if (identity) nextIdentities.add(identity);
    const previous = identity ? previousByIdentity.get(identity) : undefined;
    if (!previous) return match;
    const merged = { ...previous, ...match };
    for (const field of SCORE_FIELDS) {
      if (!isFilled(match?.[field]) && isFilled(previous?.[field])) merged[field] = previous[field];
    }
    return merged;
  });

  for (const previous of prevMatches as Record<string, any>[]) {
    const identity = copaMatchIdentity(previous);
    const hasScores = SCORE_FIELDS.some((field) => isFilled(previous?.[field]));
    if (hasScores && identity && !nextIdentities.has(identity)) mergedMatches.push(previous);
  }

  return { ...(prevPhase as Fase), ...(nextPhase as Fase), matches: mergedMatches };
}

/** Merge específico da Copa do Brasil: preserva placares de ida/volta campo a campo. */
export function mergeCopaBrasilFasesPreservingScores(
  prev: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const a = prev ?? {};
  const b = next ?? {};
  const out: Record<string, unknown> = { ...a, ...b };
  for (const key of Object.keys(a)) {
    if (key in b) out[key] = mergeCopaPhaseMatches(a[key], b[key]);
  }
  return out;
}
