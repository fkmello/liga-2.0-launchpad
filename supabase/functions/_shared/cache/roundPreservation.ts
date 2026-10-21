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

/**
 * Mesclagem da Libertadores: preserva placares também dentro de
 * Fase de Grupos -> rodada_N -> groups -> matches, além do mata-mata.
 */
function mergeLibertadoresGroupRound(prev: unknown, next: unknown): unknown {
  const prevRound = prev as Fase | undefined;
  const nextRound = next as Fase | undefined;
  const prevGroups = prevRound?.groups;
  const nextGroups = nextRound?.groups;
  if (!Array.isArray(prevGroups)) return next;
  if (!Array.isArray(nextGroups)) {
    return { ...(prevRound ?? {}), ...(nextRound ?? {}), groups: prevGroups };
  }

  const groupKey = (group: Record<string, any>) => String(group?.name ?? '').trim().toLowerCase();
  const previousByName = new Map<string, Record<string, any>>();
  for (const group of prevGroups as Record<string, any>[]) {
    const name = groupKey(group);
    if (name) previousByName.set(name, group);
  }

  const nextNames = new Set<string>();
  const mergedGroups = (nextGroups as Record<string, any>[]).map((group) => {
    const name = groupKey(group);
    if (name) nextNames.add(name);
    const previous = name ? previousByName.get(name) : undefined;
    return previous ? mergeCopaPhaseMatches(previous, group) : group;
  });

  for (const previous of prevGroups as Record<string, any>[]) {
    const name = groupKey(previous);
    const hasScores = (Array.isArray(previous?.matches) ? previous.matches : [])
      .some((match: Record<string, any>) => SCORE_FIELDS.some((field) => isFilled(match?.[field])));
    if (hasScores && name && !nextNames.has(name)) mergedGroups.push(previous);
  }

  return { ...(prevRound as Fase), ...(nextRound as Fase), groups: mergedGroups };
}

export function mergeLibertadoresFasesPreservingScores(
  prev: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const a = prev ?? {};
  const b = next ?? {};
  const out: Record<string, unknown> = { ...a, ...b };

  for (const key of Object.keys(a)) {
    if (!(key in b)) continue;
    if (key === 'Fase de Grupos') {
      const prevStage = a[key] as Fase | undefined;
      const nextStage = b[key] as Fase | undefined;
      const prevRounds = prevStage ?? {};
      const nextRounds = nextStage ?? {};
      const mergedRounds: Fase = { ...prevRounds, ...nextRounds };
      for (const roundKey of Object.keys(prevRounds)) {
        if (roundKey in nextRounds) {
          mergedRounds[roundKey] = mergeLibertadoresGroupRound(prevRounds[roundKey], nextRounds[roundKey]);
        }
      }
      out[key] = { ...prevStage, ...nextStage, ...mergedRounds };
    } else {
      out[key] = mergeCopaPhaseMatches(a[key], b[key]);
    }
  }
  return out;
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
