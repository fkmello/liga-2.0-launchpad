/**
 * Convenção ÚNICA de shadow keys para qualquer torneio.
 *
 *   shadow/{league}/{season}
 *
 * Exemplos:
 *   shadow/brasileirao_serie_a/2026
 *   shadow/copa_mundo/2026
 *   shadow/champions/2026_27
 *
 * Nenhum torneio pode definir chave sombra manualmente.
 */
export function shadowKey(league: string, season: number | string): string {
  const l = String(league).trim();
  const s = String(season).trim();
  if (!l) throw new Error('shadowKey: league obrigatória');
  if (!s) throw new Error('shadowKey: season obrigatória');
  return `shadow/${l}/${s}`;
}

export const SHADOW_KEY_PREFIX = 'shadow/';

export function isShadowKey(key: string): boolean {
  return key.startsWith(SHADOW_KEY_PREFIX);
}
