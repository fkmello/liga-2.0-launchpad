import { fetchJsonWithRetry, inChunks } from '../../sync/http.ts';

const CARTOLA_BASE = 'https://api.cartola.globo.com';

export interface CartolaTeamRaw {
  id_cartola: string;
  nome: string;
  escudo: string | null;
}

export interface CartolaMercadoStatus {
  rodada_atual: number | null;
  status_mercado: number | null;
}

/** Cliente reutilizável por Série A/B/C, Copa do Brasil, Libertadores etc. */
export async function fetchCartolaTeam(id: string): Promise<CartolaTeamRaw | null> {
  try {
    const json = (await fetchJsonWithRetry(`${CARTOLA_BASE}/time/id/${id}`)) as Record<string, any>;
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

export async function fetchCartolaTeams(ids: string[]): Promise<CartolaTeamRaw[]> {
  const results = await inChunks(ids, 10, fetchCartolaTeam);
  return results.filter((t): t is CartolaTeamRaw => !!t);
}

/**
 * Status do mercado. Buscado UMA única vez por sincronização e compartilhado
 * com todo o adapter. Erros propagam (a sincronização inteira falha).
 */
export async function fetchMercadoStatus(): Promise<CartolaMercadoStatus> {
  const json = (await fetchJsonWithRetry(`${CARTOLA_BASE}/mercado/status`)) as any;
  const rodada = Number(json?.rodada_atual);
  const status = Number(json?.status_mercado);
  return {
    rodada_atual: Number.isInteger(rodada) ? rodada : null,
    status_mercado: Number.isFinite(status) ? status : null,
  };
}

export async function fetchRodadaAtual(): Promise<number | null> {
  try {
    return (await fetchMercadoStatus()).rodada_atual;
  } catch (_e) {
    return null;
  }
}

/** 404 explícito da API = ausência esperada de pontuação (não é falha). */
function isExpectedNotFound(err: unknown): boolean {
  return /\[404\]/.test(String((err as Error)?.message ?? ''));
}

/**
 * Pontuação de um time em uma rodada.
 * - número  -> pontuação confirmada para a rodada solicitada
 * - null    -> ausência ESPERADA (time não encontrado / não escalado / rodada
 *              ainda não pontuada). O placar anterior deve ser preservado.
 * - throw   -> rede, timeout, 5xx, 4xx inesperado, JSON inválido. A
 *              sincronização inteira falha; nada é persistido.
 */
export async function fetchTeamRoundScore(id: string, rodada: number): Promise<number | null> {
  let json: Record<string, any>;
  try {
    json = (await fetchJsonWithRetry(
      `${CARTOLA_BASE}/time/id/${id}/${rodada}`,
    )) as Record<string, any>;
  } catch (e) {
    if (isExpectedNotFound(e)) return null;
    throw e;
  }

  // Resposta válida sem escalação/time: ausência esperada.
  if (!json || typeof json !== 'object') {
    throw new Error(`Resposta inválida da API para o time ${id} na rodada ${rodada}`);
  }
  if (json.pontos === undefined || json.pontos === null) return null;

  // A API devolve a última rodada disponível quando a solicitada ainda não
  // foi pontuada — só aceitamos quando a rodada bate.
  const rodadaResp = Number(json.rodada_atual);
  if (Number.isInteger(rodadaResp) && rodadaResp !== rodada) return null;

  const pontos = Number(json.pontos);
  if (!Number.isFinite(pontos)) return null;
  return pontos;
}

/** Falha de qualquer time (exceto ausência esperada) aborta a sincronização. */
export async function fetchTeamsRoundScores(
  ids: string[],
  rodada: number,
): Promise<Map<string, number | null>> {
  const results = await inChunks(ids, 10, async (id: string) => {
    const pontos = await fetchTeamRoundScore(id, rodada);
    return [id, pontos] as [string, number | null];
  });
  return new Map(results);
}
