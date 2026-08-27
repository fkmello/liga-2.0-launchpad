/**
 * Fotos de jogadores da Copa do Mundo FIFA — resolvidas dinamicamente
 * via Supabase Storage (bucket público `copa2026`), independentes da planilha.
 *
 * Layout no bucket:  copa2026/<CODIGO_SELECAO>/<atleta_id>.png
 *
 * Use apenas quando league === 'copa_mundo'. Demais ligas mantêm o
 * comportamento atual (foto vinda da API do Cartola).
 */

export const COPA_PLAYER_IMAGE_BASE =
  'https://ctcheittftkcnueojoco.supabase.co/storage/v1/object/public/copa2026/';

export const COPA_TEAM_MAP: Record<number, string> = {
  1: 'OUT',
  2318: 'BRA',
  2320: 'SUI',
  2323: 'NOR',
  2324: 'EGI',
  2326: 'ESP',
  2327: 'ESC',
  2328: 'TUR',
  2332: 'MAR',
  2333: 'AUS',
  2334: 'HAI',
  2336: 'IRA',
  2337: 'TUN',
  2338: 'AGL',
  2340: 'NZE',
  2342: 'IRQ',
  2344: 'ARS',
  2347: 'SEN',
  2350: 'CDM',
  2352: 'TCH',
  2354: 'PAR',
  2356: 'URU',
  2357: 'ARG',
  2358: 'AFS',
  2360: 'MEX',
  2361: 'CAN',
  2365: 'EUA',
  2368: 'SUE',
  2369: 'JAP',
  2370: 'ING',
  2372: 'EQU',
  2373: 'COL',
  2374: 'COR',
  2375: 'GAN',
  2379: 'CRO',
  2381: 'HOL',
  2384: 'ALE',
  2385: 'FRA',
  2390: 'POR',
  2391: 'AUT',
  2392: 'BEL',
  2865: 'BOS',
  3061: 'UZB',
  3062: 'PAN',
  3184: 'RDC',
  3201: 'CAB',
  3221: 'CUR',
  3231: 'JOR',
  3238: 'CAT',
};

export function getCopaTeamCode(clubeId?: number): string {
  return COPA_TEAM_MAP[clubeId ?? 1] ?? 'OUT';
}

/** Fallback absoluto usado quando atleta/clube vêm inválidos ou a imagem 404. */
export const COPA_PLAYER_DEFAULT_IMAGE = `${COPA_PLAYER_IMAGE_BASE}OUT.png`;

export function getCopaPlayerImage(
  atletaId?: number | string,
  clubeId?: number,
): string {
  if (!atletaId) return COPA_PLAYER_DEFAULT_IMAGE;
  const teamCode = COPA_TEAM_MAP[clubeId ?? 1] ?? 'OUT';
  return `${COPA_PLAYER_IMAGE_BASE}${teamCode}/${atletaId}.png`;
}

/** Fallback usado pelo onError dos <img> — nunca quebra o render. */
export function getCopaPlayerFallbackImage(atletaId?: number | string): string {
  if (!atletaId) return COPA_PLAYER_DEFAULT_IMAGE;
  return `${COPA_PLAYER_IMAGE_BASE}OUT/${atletaId}.png`;
}
