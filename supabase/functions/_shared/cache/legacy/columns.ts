/**
 * Mapeamento único das colunas da matriz de classificação legada (planilha
 * Brasileirão Série A/B/C). O parser legado, o auditor de divergências e o
 * relatório de cobertura DEVEM usar estas constantes.
 *
 * Layout da planilha (0-indexed):
 *   0 = coluna vazia | 1 = posição | 2 = escudo | 3 = time
 *   4 = pontos | 5 = jogos | 6 = vitórias | 11 = saldo de gols | 13 = gols pró
 */
export const LEGACY_STANDINGS_COLUMNS = {
  position: 1,
  teamName: 3,
  points: 4,
  played: 5,
  wins: 6,
  goalDiff: 11,
  goalsFor: 13,
} as const;

export function legacyToNum(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Uma linha só é uma equipe quando tem nome e pontuação numérica. */
export function isLegacyStandingsTeamRow(row: unknown): boolean {
  if (!Array.isArray(row)) return false;
  const name = String(row[LEGACY_STANDINGS_COLUMNS.teamName] ?? '').trim();
  if (!name) return false;
  return legacyToNum(row[LEGACY_STANDINGS_COLUMNS.points]) !== null;
}
