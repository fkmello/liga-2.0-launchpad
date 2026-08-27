import { resolveTorneioApi } from './tournamentApiMap';

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cartola`;

/**
 * Monta a URL para a Edge Function `cartola`, adicionando automaticamente
 * o parâmetro `torneio` resolvido a partir do `league` informado.
 *
 * - Se `league` não for informado → cai em `default`
 * - Se informado → resolvido via `TOURNAMENT_API_MAP`
 */
export function buildCartolaUrl(
  query: Record<string, string | number | undefined> = {},
  league?: string,
  options?: { nocache?: boolean },
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  params.set('torneio', resolveTorneioApi(league));
  if (options?.nocache) {
    params.set('nocache', '1');
    params.set('_t', String(Date.now()));
  }
  return `${BASE}?${params.toString()}`;
}
