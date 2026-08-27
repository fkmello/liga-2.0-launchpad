import { fetchJsonWithRetry, inChunks } from '../../sync/http.ts';

const COPA_BASE = 'https://api.copa.cartola.globo.com';

export interface CopaTeamRaw {
  id_cartola: string;
  nome: string;
  escudo: string | null;
}

export async function fetchCopaTeam(id: string): Promise<CopaTeamRaw | null> {
  try {
    const json = (await fetchJsonWithRetry(`${COPA_BASE}/time/id/${id}`)) as Record<string, any>;
    const time = json?.time ?? json;
    if (!time) return null;
    return {
      id_cartola: String(id),
      nome: String(time.nome ?? time.nome_cartola ?? ''),
      escudo: time.url_escudo_png ?? time.url_escudo_svg ?? null,
    };
  } catch (_e) {
    return null;
  }
}

export async function fetchCopaTeams(ids: string[]): Promise<CopaTeamRaw[]> {
  const results = await inChunks(ids, 10, fetchCopaTeam);
  return results.filter((t): t is CopaTeamRaw => !!t);
}
