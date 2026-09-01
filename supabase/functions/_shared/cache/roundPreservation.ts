/**
 * Preservação de rodadas já consolidadas.
 *
 * Regra fundamental: uma rodada que já possui placares NUNCA pode ser
 * substituída por uma versão sem placares (baseline legado vazio ou
 * reconstrução parcial). O shadow é um histórico CUMULATIVO.
 */

type Fase = Record<string, any>;

function isFilled(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

/** Quantos confrontos da fase possuem os dois placares preenchidos. */
export function countScoredMatches(fase: unknown): number {
  const matches = (fase as Fase | undefined)?.matches;
  if (!Array.isArray(matches)) return 0;
  return matches.filter((m: any) => isFilled(m?.score1) && isFilled(m?.score2)).length;
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
    const prevScored = countScoredMatches(a[key]);
    const nextScored = countScoredMatches(b[key]);
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
