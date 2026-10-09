/**
 * Preservação de rodadas já consolidadas.
 *
 * Regra fundamental: uma rodada que já possui placares NUNCA pode ser
 * substituída por uma versão sem placares (baseline legado vazio ou
 * reconstrução parcial). O shadow é um histórico CUMULATIVO.
 */

type Fase = Record<string, any>;

const SCORE_FIELDS = ['score1', 'score2', 'scoreIda1', 'scoreIda2', 'scoreVolta1', 'scoreVolta2'];

function matchIdentity(match: Record<string, any>): string | null {
  // Prioriza os dois times: matchNumber pode continuar igual mesmo se o
  // confronto de um slot mudar após avanço de fase. Nunca associa por índice.
  const normalizeTeam = (value: unknown) => String(value ?? '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .trim()
    .replace(/\\s+/g, ' ')
    .toLowerCase();
  const team1 = normalizeTeam(match.team1 ?? match.home);
  const team2 = normalizeTeam(match.team2 ?? match.away);
  if (team1 && team2) return 'teams:' + team1 + '::' + team2;
  const number = String(match.matchNumber ?? match.matchOrder ?? '').trim();
  return number ? 'number:' + number : null;
}

/** Merge campo a campo para que um payload parcial não apague placares antigos. */
function mergePhaseMatchesPreservingScores(prev: unknown, next: unknown): unknown {
  const prevMatches = (prev as Fase | undefined)?.matches;
  const nextMatches = (next as Fase | undefined)?.matches;
  if (!Array.isArray(prevMatches) || !Array.isArray(nextMatches)) return next;

  const previousByIdentity = new Map<string, Record<string, any>>();
  prevMatches.forEach((match: Record<string, any>) => {
    const identity = matchIdentity(match);
    if (identity) previousByIdentity.set(identity, match);
  });

  const nextIdentities = new Set<string>();
  const mergedMatches = nextMatches.map((match: Record<string, any>) => {
    const identity = matchIdentity(match);
    if (identity) nextIdentities.add(identity);
    const previous = identity ? previousByIdentity.get(identity) : undefined;
    if (!previous) return match;
    const merged = { ...previous, ...match };
    for (const field of SCORE_FIELDS) {
      if (!isFilled(match?.[field]) && isFilled(previous?.[field])) {
        merged[field] = previous[field];
      }
    }
    return merged;
  });

  // Se o payload novo vier incompleto, não descarte confrontos anteriores
  // que já têm placares; nunca tente reassociá-los por posição.
  for (const previous of prevMatches as Record<string, any>[]) {
    const identity = matchIdentity(previous);
    const hasScores = SCORE_FIELDS.some((field) => isFilled(previous?.[field]));
    if (hasScores && identity && !nextIdentities.has(identity)) {
      mergedMatches.push(previous);
    }
  }

  return {
    ...(prev as Fase),
    ...(next as Fase),
    matches: mergedMatches,
  };
}

function isFilled(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

/** Quantos confrontos da fase possuem os dois placares preenchidos. */
export function countScoredMatches(fase: unknown): number {
  const matches = (fase as Fase | undefined)?.matches;
  if (!Array.isArray(matches)) return 0;
  return matches.filter((m: any) => {
    const regularRoundScored = isFilled(m?.score1) && isFilled(m?.score2);
    const firstLegScored = isFilled(m?.scoreIda1) && isFilled(m?.scoreIda2);
    const secondLegScored = isFilled(m?.scoreVolta1) && isFilled(m?.scoreVolta2);
    return regularRoundScored || firstLegScored || secondLegScored;
  }).length;
}

/** Quantos confrontos a fase possui (com ou sem placar). */
export function countMatches(fase: unknown): number {
  const matches = (fase as Fase | undefined)?.matches;
  return Array.isArray(matches) ? matches.length : 0;
}

/**
 * Merge de `fases` preservando rodadas: para cada rodada, vence o lado com
 * MAIS placares consolidados. Empate em placares → vence o lado com mais
 * confrontos; persistindo o empate, vence `next` (dado mais recente).
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
    // Sempre faz merge campo a campo: comparar só a quantidade de confrontos
    // pontuados impediria gravar a volta se uma única partida ainda não tivesse score.
    out[key] = mergePhaseMatchesPreservingScores(a[key], b[key]);
  }
  return out;
}
