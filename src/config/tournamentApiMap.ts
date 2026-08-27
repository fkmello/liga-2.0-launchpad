/**
 * Mapeamento central de identificadores de torneio (league) → endpoint da API Cartola.
 *
 * Naming oficial obrigatório (único permitido em todo o projeto):
 *   serie_a, serie_b, serie_c, copa_brasil,
 *   libertadores, sulamericana, intercontinental,
 *   campeoes, copa_mundo
 *
 * Proibido usar abreviações como `copa_br`, `liberta`, `sula`.
 */
export const TOURNAMENT_API_MAP: Record<string, string> = {
  serie_a: 'default',
  serie_b: 'default',
  serie_c: 'default',
  copa_brasil: 'default',
  libertadores: 'default',
  sulamericana: 'default',
  intercontinental: 'default',

  campeoes: 'campeoes',
  copa_mundo: 'copa',
};

export function resolveTorneioApi(league?: string): string {
  if (!league) return 'default';
  return TOURNAMENT_API_MAP[league] ?? 'default';
}
