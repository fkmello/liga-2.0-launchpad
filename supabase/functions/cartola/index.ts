const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Cache em memória ──────────────────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  ts: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string, ttlMs: number): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  return null;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() });
}

// partida_data vem da API Cartola em horário de Brasília (UTC-3), sem indicador de fuso.
// new Date("YYYY-MM-DD HH:MM:SS") em Deno interpreta como UTC, adiantando 3h. Para evitar
// que partidas sejam consideradas "iniciadas" antes da hora oficial, parseamos manualmente.
function parseBrtTimestamp(s: string): number {
  if (!s) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return NaN;
  const [, y, mo, d, h, mi, se] = m;
  // BRT (UTC-3): instante UTC equivalente = BRT + 3h
  return Date.UTC(+y, +mo - 1, +d, +h + 3, +mi, +se);
}

// ── Mapa fixo de clubes ──────────────────────────────────────────────
const CLUBES_MAP: Record<number, string> = {
  262: "FLA", 1: "OUT", 266: "FLU", 267: "VAS", 263: "BOT", 296: "BOT",
  275: "PAL", 264: "COR", 276: "SAO", 277: "SAN", 282: "CAM",
  283: "CRU", 284: "GRE", 285: "INT", 294: "CFC", 265: "BAH",
  315: "CHA", 364: "REM", 287: "VIT", 280: "RBB", 293: "CAP",
  2305: "MIR",
};

// Mapa de clubes da Champions League (torneio=campeoes)
const CLUBES_CAMPEOES_MAP: Record<number, string> = {
  1: "OUT", 2606: "INT", 2607: "BAY", 2615: "ATL", 2623: "JUV",
  2632: "NAP", 2635: "BAR", 2637: "MAD", 2642: "VIL", 2643: "ATH",
  2661: "CHE", 2663: "ARS", 2664: "TOT", 2665: "MAC", 2667: "LIV",
  2680: "NEW", 2686: "BYL", 2687: "BRD", 2692: "EFT", 2696: "PSG",
  2710: "OLM", 2711: "MON", 2792: "COP", 2793: "AJA", 2818: "PSV",
  2849: "BRU", 2933: "OLY", 2963: "ATA", 3722: "QAR", 4242: "KAI",
  4364: "SPR", 54: "GAL", 5481: "BOD", 6197: "USG", 81: "BEN",
  82: "SPT", 8748: "PAF",
};

// Mapa de clubes da Copa do Mundo FIFA (torneio=copa)
const CLUBES_COPA_MAP: Record<number, string> = {
  1: "OUT",
  2318: "BRA", 2320: "SUI", 2323: "NOR", 2324: "EGI", 2326: "ESP",
  2327: "ESC", 2328: "TUR", 2332: "MAR", 2333: "AUS", 2334: "HAI",
  2336: "IRA", 2337: "TUN", 2338: "AGL", 2340: "NZE", 2342: "IRQ",
  2344: "ARS", 2347: "SEN", 2350: "CDM", 2352: "TCH", 2354: "PAR",
  2356: "URU", 2357: "ARG", 2358: "AFS", 2360: "MEX", 2361: "CAN",
  2365: "EUA", 2368: "SUE", 2369: "JAP", 2370: "ING", 2372: "EQU",
  2373: "COL", 2374: "COR", 2375: "GAN", 2379: "CRO", 2381: "HOL",
  2384: "ALE", 2385: "FRA", 2390: "POR", 2391: "AUT", 2392: "BEL",
  2865: "BOS", 3061: "UZB", 3062: "PAN", 3184: "RDC", 3201: "CAB",
  3221: "CUR", 3231: "JOR", 3238: "CAT",
};

const STORAGE_BASE = "https://ctcheittftkcnueojoco.supabase.co/storage/v1/object/public/clubes2026";
const STORAGE_BASE_CAMPEOES = "https://ctcheittftkcnueojoco.supabase.co/storage/v1/object/public/campeoes2526";
const STORAGE_BASE_COPA = "https://ctcheittftkcnueojoco.supabase.co/storage/v1/object/public/copa2026";

function getClubeImage(clubeId: number, torneio?: string | null): string {
  if (torneio === 'campeoes') {
    const abrev = CLUBES_CAMPEOES_MAP[clubeId];
    return abrev
      ? `${STORAGE_BASE_CAMPEOES}/${abrev}.png`
      : `${STORAGE_BASE_CAMPEOES}/fallback.png`;
  }
  if (torneio === 'copa') {
    const abrev = CLUBES_COPA_MAP[clubeId];
    return abrev
      ? `${STORAGE_BASE_COPA}/${abrev}.png`
      : `${STORAGE_BASE_COPA}/fallback.png`;
  }
  const abrev = CLUBES_MAP[clubeId];
  return abrev
    ? `${STORAGE_BASE}/${abrev}.png`
    : `${STORAGE_BASE}/fallback.png`;
}

function getClubeAbrev(clubeId: number, torneio?: string | null): string {
  if (torneio === 'campeoes') return CLUBES_CAMPEOES_MAP[clubeId] ?? '';
  if (torneio === 'copa') return CLUBES_COPA_MAP[clubeId] ?? '';
  return CLUBES_MAP[clubeId] ?? '';
}

// ── Fetch helpers (multi-torneio) ─────────────────────────────────────
const API_BASES: Record<string, string> = {
  default: 'https://api.cartola.globo.com',
  campeoes: 'https://api.campeoes.cartola.globo.com',
  copa: 'https://api.copa.cartola.globo.com',
};

function resolveApiBase(torneio?: string | null): string {
  if (!torneio) return API_BASES.default;
  return API_BASES[torneio] ?? API_BASES.default;
}

function resolveTorneioKey(torneio?: string | null): string {
  if (!torneio) return 'default';
  return API_BASES[torneio] ? torneio : 'default';
}

/** Erro de rede (host fora do ar / recusando conexão), não é erro HTTP. */
export class UpstreamUnavailableError extends Error {}

async function apiFetch<T>(path: string, torneio?: string | null): Promise<T> {
  const base = resolveApiBase(torneio);
  const key = resolveTorneioKey(torneio);
  let lastErr: unknown;

  // A API do Cartola às vezes recusa conexões momentaneamente: tenta 3x.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt));
    try {
      const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`Cartola API [${key}] ${path} → ${res.status}`);
      return res.json() as Promise<T>;
    } catch (e) {
      lastErr = e;
      // Erro HTTP legítimo (4xx/5xx) não deve ser repetido.
      if (e instanceof Error && e.message.startsWith('Cartola API [')) throw e;
    }
  }
  throw new UpstreamUnavailableError(
    `A API do Cartola (${key}) está indisponível no momento. Tente novamente em instantes.`,
  );
}


async function fetchCached<T>(path: string, ttlMs: number, torneio?: string | null): Promise<T> {
  const key = `${resolveTorneioKey(torneio)}:${path}`;
  const hit = getCached<T>(key, ttlMs);
  if (hit) return hit;
  const data = await apiFetch<T>(path, torneio);
  setCache(key, data);
  return data;
}

// ── Tipos internos ────────────────────────────────────────────────────
interface MercadoStatus {
  rodada_atual: number;
  status_mercado: number;
  fechamento: { dia: number; mes: number; ano: number; hora: number; minuto: number };
}

interface TimeAtleta {
  atleta_id: number;
  apelido: string;
  foto: string;
  posicao_id: number;
  clube_id: number;
  is_capitao: boolean;
  preco_num: number;
  pontos_num?: number;
  variacao_num?: number;
  media_num?: number;
}

interface TimeData {
  atletas: TimeAtleta[];
  clubes: Record<string, { abreviacao: string; escudos: Record<string, string> }>;
  time: { nome: string; nome_cartola: string; url_escudo_svg: string };
  patrimonio: number;
  variacao_patrimonio: number;
  pontos: number;
  pontos_campeonato: number;
  reservas?: TimeAtleta[];
  capitao_id: number;
  reserva_luxo_id?: number;
  esquema_id: number;
}

interface Esquema {
  esquema_id: number;
  nome: string;
  posicoes: Record<string, number>;
}

interface AtletaPontuado {
  apelido: string;
  foto: string;
  posicao_id: number;
  clube_nome: string;
  pontuacao: number;
  scout: Record<string, number>;
  entrou_em_campo: boolean;
}

interface AtletaMercado {
  atleta_id: number;
  apelido: string;
  foto: string;
  posicao_id: number;
  clube_id: number;
  preco_num: number;
  status_id: number;
  scout: Record<string, number>;
}

// ── Formatação de fechamento ──────────────────────────────────────────
function formatFechamento(f: MercadoStatus['fechamento']): string {
  if (!f) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  
  const nowBr = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const todayBr = new Date(nowBr.getFullYear(), nowBr.getMonth(), nowBr.getDate());
  const closeDate = new Date(f.ano, f.mes - 1, f.dia);
  
  const diffDays = Math.floor((closeDate.getTime() - todayBr.getTime()) / (1000 * 60 * 60 * 24));
  const timeStr = `${pad(f.hora)}:${pad(f.minuto)}`;
  
  if (diffDays === 0) return `Hoje ${timeStr}`;
  if (diffDays === 1) return `Amanhã ${timeStr}`;
  return `${pad(f.dia)}/${pad(f.mes)}/${f.ano} ${timeStr}`;
}

// ── Resposta padrão de jogador ────────────────────────────────────────
interface CartolaPlayerOut {
  atleta_id: number;
  apelido: string;
  foto: string;
  posicao_id: number;
  preco_num: number;
  clube_abreviacao: string;
  clube_escudo: string;
  pontuacao: number;
  variacao_num?: number;
  media_num?: number;
  scout: Record<string, number>;
  entrou_em_campo: boolean;
  is_capitao: boolean;
  status_id?: number;
  game_status?: 'not_started' | 'played' | 'not_played';
  is_subbed_in?: boolean;
  is_subbed_out?: boolean;
}

// ── Motor de substituição compartilhado ───────────────────────────────
// Usado tanto pelo endpoint single-team quanto por batch_lineups, garantindo
// que o total de pontos exibido nas duas telas (Comparar pontuação x Confrontos)
// seja sempre idêntico. Toda a lógica de substituição em tempo real, herança
// de capitão e multiplicador 1.5x está concentrada aqui.
interface ComputeLineupResult {
  titularesOut: CartolaPlayerOut[];
  reservasOut: CartolaPlayerOut[];
  capitaoEfetivo: number;
  totalParcial: number;
  playedCount: number;
}

function computeLineup(
  timeData: TimeData,
  pontuados: Record<string, AtletaPontuado>,
  jogoIniciadoMap: Map<number, boolean>,
  jogoFinalizadoMap: Map<number, boolean>,
  torneio?: string | null,
): ComputeLineupResult {
  function getAthleteGameStatus(atletaId: number, clubeId: number): 'not_started' | 'played' | 'not_played' {
    if (!jogoIniciadoMap.has(clubeId)) return 'not_played';
    const gameStarted = jogoIniciadoMap.get(clubeId) ?? false;
    if (!gameStarted) return 'not_started';
    const pont = pontuados[String(atletaId)];
    if (pont?.entrou_em_campo === true) return 'played';
    return 'not_played';
  }

  function getCoachGameStatus(atletaId: number, clubeId: number): 'not_started' | 'played' | 'not_played' {
    if (!jogoIniciadoMap.has(clubeId)) return 'not_played';
    const gameFinished = jogoFinalizadoMap.get(clubeId) ?? false;
    const gameStarted = jogoIniciadoMap.get(clubeId) ?? false;
    if (!gameStarted) return 'not_started';
    const pont = pontuados[String(atletaId)];
    if (pont) return 'played';
    return gameFinished ? 'played' : 'not_started';
  }

  function getGameStatus(atletaId: number, clubeId: number, posicaoId?: number): 'not_started' | 'played' | 'not_played' {
    if (posicaoId === 6) return getCoachGameStatus(atletaId, clubeId);
    return getAthleteGameStatus(atletaId, clubeId);
  }

  const reservasRaw = timeData.reservas ?? [];
  const reservasByPos = new Map<number, TimeAtleta[]>();
  for (const r of reservasRaw) {
    const arr = reservasByPos.get(r.posicao_id) ?? [];
    arr.push(r);
    reservasByPos.set(r.posicao_id, arr);
  }

  const titularesRaw = timeData.atletas ?? [];
  const usedReservas = new Set<number>();
  const substitutedStarters: CartolaPlayerOut[] = [];
  const titularesOut: CartolaPlayerOut[] = [];
  let capitaoEfetivo = timeData.capitao_id;

  for (const titular of titularesRaw) {
    const gs = getGameStatus(titular.atleta_id, titular.clube_id, titular.posicao_id);
    const pont = pontuados[String(titular.atleta_id)];

    if (gs === 'played') {
      titularesOut.push({
        atleta_id: titular.atleta_id,
        apelido: titular.apelido || '',
        foto: getClubeImage(titular.clube_id, torneio),
        posicao_id: titular.posicao_id,
        preco_num: titular.preco_num ?? 0,
        clube_abreviacao: getClubeAbrev(titular.clube_id, torneio),
        clube_escudo: getClubeImage(titular.clube_id, torneio),
        pontuacao: pont?.pontuacao ?? 0,
        variacao_num: titular.variacao_num ?? 0,
        media_num: titular.media_num ?? 0,
        scout: pont?.scout ?? {},
        entrou_em_campo: true,
        is_capitao: titular.atleta_id === capitaoEfetivo,
        game_status: 'played',
      });
    } else if (gs === 'not_started') {
      titularesOut.push({
        atleta_id: titular.atleta_id,
        apelido: titular.apelido || '',
        foto: getClubeImage(titular.clube_id, torneio),
        posicao_id: titular.posicao_id,
        preco_num: titular.preco_num ?? 0,
        clube_abreviacao: getClubeAbrev(titular.clube_id, torneio),
        clube_escudo: getClubeImage(titular.clube_id, torneio),
        pontuacao: 0,
        variacao_num: titular.variacao_num ?? 0,
        media_num: titular.media_num ?? 0,
        scout: {},
        entrou_em_campo: false,
        is_capitao: titular.atleta_id === capitaoEfetivo,
        game_status: 'not_started',
      });
    } else {
      const reservasFila = reservasByPos.get(titular.posicao_id) ?? [];
      let substituiu = false;

      for (const res of reservasFila) {
        if (usedReservas.has(res.atleta_id)) continue;
        const resPont = pontuados[String(res.atleta_id)];
        if (resPont && resPont.entrou_em_campo && resPont.pontuacao > 0) {
          usedReservas.add(res.atleta_id);
          if (titular.atleta_id === capitaoEfetivo) {
            capitaoEfetivo = res.atleta_id;
          }
          titularesOut.push({
            atleta_id: res.atleta_id,
            apelido: res.apelido || '',
            foto: getClubeImage(res.clube_id, torneio),
            posicao_id: res.posicao_id,
            preco_num: res.preco_num ?? 0,
            clube_abreviacao: getClubeAbrev(res.clube_id, torneio),
            clube_escudo: getClubeImage(res.clube_id, torneio),
            pontuacao: resPont.pontuacao ?? 0,
            variacao_num: res.variacao_num ?? 0,
            media_num: res.media_num ?? 0,
            scout: resPont.scout ?? {},
            entrou_em_campo: true,
            is_capitao: res.atleta_id === capitaoEfetivo,
            game_status: 'played',
            is_subbed_in: true,
          });
          substitutedStarters.push({
            atleta_id: titular.atleta_id,
            apelido: titular.apelido || '',
            foto: getClubeImage(titular.clube_id, torneio),
            posicao_id: titular.posicao_id,
            preco_num: titular.preco_num ?? 0,
            clube_abreviacao: getClubeAbrev(titular.clube_id, torneio),
            clube_escudo: getClubeImage(titular.clube_id, torneio),
            pontuacao: 0,
            variacao_num: titular.variacao_num ?? 0,
            media_num: titular.media_num ?? 0,
            scout: {},
            entrou_em_campo: false,
            is_capitao: false,
            game_status: 'not_played',
            is_subbed_out: true,
          });
          substituiu = true;
          break;
        }
      }

      if (!substituiu) {
        titularesOut.push({
          atleta_id: titular.atleta_id,
          apelido: titular.apelido || '',
          foto: getClubeImage(titular.clube_id, torneio),
          posicao_id: titular.posicao_id,
          preco_num: titular.preco_num ?? 0,
          clube_abreviacao: getClubeAbrev(titular.clube_id, torneio),
          clube_escudo: getClubeImage(titular.clube_id, torneio),
          pontuacao: 0,
          variacao_num: titular.variacao_num ?? 0,
          media_num: titular.media_num ?? 0,
          scout: {},
          entrou_em_campo: false,
          is_capitao: titular.atleta_id === capitaoEfetivo,
          game_status: 'not_played',
        });
      }
    }
  }

  // ── CASO B: Reserva de luxo substitui menor pontuador da posição ──
  const luxoId = timeData.reserva_luxo_id;
  if (luxoId && !usedReservas.has(luxoId)) {
    const luxoRaw = reservasRaw.find(r => r.atleta_id === luxoId);
    if (luxoRaw) {
      const luxoPont = pontuados[String(luxoId)];
      if (luxoPont && luxoPont.entrou_em_campo && luxoPont.pontuacao > 0) {
        const luxoPosId = luxoRaw.posicao_id;
        const titPos = titularesOut.filter(t => t.posicao_id === luxoPosId);
        const todosEntraram = titPos.length > 0 && titPos.every(t => t.entrou_em_campo);

        if (todosEntraram) {
          const ativos = titPos.filter(t => t.entrou_em_campo && t.game_status === 'played');
          if (ativos.length > 0) {
            let menorPontos = Infinity;
            for (const t of ativos) {
              if (t.pontuacao < menorPontos) menorPontos = t.pontuacao;
            }

            if (luxoPont.pontuacao > menorPontos) {
              const candidatos = ativos.filter(t => t.pontuacao === menorPontos);
              candidatos.sort((a, b) => {
                if (a.is_capitao && !b.is_capitao) return -1;
                if (!a.is_capitao && b.is_capitao) return 1;
                return 0;
              });
              const alvo = candidatos[0];
              const alvoIdx = titularesOut.findIndex(t => t.atleta_id === alvo.atleta_id);
              if (alvoIdx !== -1) {
                if (alvo.is_capitao) capitaoEfetivo = luxoId;
                substitutedStarters.push({
                  ...alvo,
                  is_capitao: false,
                  game_status: 'played',
                  is_subbed_out: true,
                });
                titularesOut[alvoIdx] = {
                  atleta_id: luxoRaw.atleta_id,
                  apelido: luxoRaw.apelido || '',
                  foto: getClubeImage(luxoRaw.clube_id, torneio),
                  posicao_id: luxoRaw.posicao_id,
                  preco_num: luxoRaw.preco_num ?? 0,
                  clube_abreviacao: getClubeAbrev(luxoRaw.clube_id, torneio),
                  clube_escudo: getClubeImage(luxoRaw.clube_id, torneio),
                  pontuacao: luxoPont.pontuacao ?? 0,
                  variacao_num: luxoRaw.variacao_num ?? 0,
                  media_num: luxoRaw.media_num ?? 0,
                  scout: luxoPont.scout ?? {},
                  entrou_em_campo: true,
                  is_capitao: luxoRaw.atleta_id === capitaoEfetivo,
                  game_status: 'played',
                  is_subbed_in: true,
                };
                usedReservas.add(luxoId);
              }
            }
          }
        }
      }
    }
  }

  // Aplicar multiplicador 1.5x no capitão
  for (const t of titularesOut) {
    if (t.is_capitao) {
      t.pontuacao = t.pontuacao * 1.5;
      break;
    }
  }

  const totalParcial = titularesOut.reduce((sum, t) => sum + t.pontuacao, 0);

  // Build reserves: original (minus used) + substituted starters
  const reservasOut: CartolaPlayerOut[] = [];
  for (const res of reservasRaw) {
    if (usedReservas.has(res.atleta_id)) continue;
    const resPont = pontuados[String(res.atleta_id)];
    const gs = getGameStatus(res.atleta_id, res.clube_id, res.posicao_id);
    reservasOut.push({
      atleta_id: res.atleta_id,
      apelido: res.apelido || '',
      foto: getClubeImage(res.clube_id, torneio),
      posicao_id: res.posicao_id,
      preco_num: res.preco_num ?? 0,
      clube_abreviacao: getClubeAbrev(res.clube_id, torneio),
      clube_escudo: getClubeImage(res.clube_id, torneio),
      pontuacao: resPont?.pontuacao ?? 0,
      variacao_num: res.variacao_num ?? 0,
      media_num: res.media_num ?? 0,
      scout: resPont?.scout ?? {},
      entrou_em_campo: resPont?.entrou_em_campo ?? false,
      is_capitao: false,
      game_status: gs,
    });
  }
  for (const starter of substitutedStarters) {
    reservasOut.push(starter);
  }

  const playedCount = titularesOut.filter(t => t.game_status === 'played').length;

  return { titularesOut, reservasOut, capitaoEfetivo, totalParcial, playedCount };
}

// ── Handler ───────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const idCartola = url.searchParams.get('id_cartola');
    const rodadaParam = url.searchParams.get('rodada');
    const actionParam = url.searchParams.get('action');

    const torneio = url.searchParams.get('torneio');
    const nocache = url.searchParams.get('nocache') === '1';
    const noStoreHeaders: Record<string, string> = nocache
      ? { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' }
      : {};

    // Handle pontuados action
    if (actionParam === 'pontuados') {
      const pontuados = await fetchCached<{ atletas: unknown[] }>('/atletas/pontuados', 30_000, torneio);
      return new Response(JSON.stringify(pontuados), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle partidas action
    if (actionParam === 'partidas') {
      const partidas = await fetchCached<{ partidas: unknown[] }>('/partidas', 30_000, torneio);
      return new Response(JSON.stringify(partidas), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle market_status action
    if (actionParam === 'market_status') {
      const mercado = await fetchCached<MercadoStatus>('/mercado/status', 60_000, torneio);
      return new Response(JSON.stringify({
        rodada_atual: mercado.rodada_atual,
        status_mercado: mercado.status_mercado,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Handle batch_lineups action
    if (actionParam === 'batch_lineups') {
      const idsParam = url.searchParams.get('ids');
      const rodada = url.searchParams.get('rodada');
      if (!idsParam || !rodada) {
        return new Response(JSON.stringify({ error: 'ids e rodada obrigatórios' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ── Fetch pontuados once (full AtletaPontuado) ──
      const pontuadosRaw = await fetchCached<{ atletas: Record<string, AtletaPontuado> }>(
        '/atletas/pontuados',
        30_000,
        torneio,
      );
      const pontuados = pontuadosRaw?.atletas ?? {};

      // ── Fetch partidas once ──
      const partidasRaw = await fetchCached<{ partidas: Record<string, { clube_casa_id: number; clube_visitante_id: number; partida_data: string; status_transmissao_tr: string }> }>(
        '/partidas',
        30_000,
        torneio,
      );
      const jogoFinalizadoMap = new Map<number, boolean>();
      const jogoIniciadoMap = new Map<number, boolean>();
      const partidasObj = partidasRaw?.partidas ?? {};
      const now = Date.now();
      for (const p of Object.values(partidasObj)) {
        const ts = parseBrtTimestamp(p.partida_data);
        const timePassed = !Number.isNaN(ts) && ts <= now;
        const statusFinished = p.status_transmissao_tr === 'ENCERRADA' || p.status_transmissao_tr === 'POS_JOGO';
        const finalizado = statusFinished && timePassed;
        jogoFinalizadoMap.set(p.clube_casa_id, finalizado);
        jogoFinalizadoMap.set(p.clube_visitante_id, finalizado);
        // Usa apenas o horário oficial (partida_data em BRT); status_transmissao_tr
        // não é confiável (a API marca EM_ANDAMENTO antes da hora oficial).
        const iniciado = timePassed;
        jogoIniciadoMap.set(p.clube_casa_id, iniciado);
        jogoIniciadoMap.set(p.clube_visitante_id, iniciado);
      }

      // ── Process each team via shared computeLineup ──
      const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
      const scores: Record<string, number | null> = {};
      const playedCounts: Record<string, number> = {};

      for (const id of ids) {
        try {
          const lineup = await fetchCached<TimeData>(
            `/time/id/${id}/${rodada}`,
            30_000,
            torneio,
          );

          const result = computeLineup(lineup, pontuados, jogoIniciadoMap, jogoFinalizadoMap, torneio);
          // computeLineup já inclui o técnico (posicao_id=6) em titularesOut/playedCount
          scores[id] = Number(result.totalParcial.toFixed(2));
          playedCounts[id] = result.playedCount;
        } catch (e) {
          console.error(`batch_lineups: failed for id ${id}`, e);
          scores[id] = 0;
        }
      }

      return new Response(JSON.stringify({ scores, playedCounts }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!idCartola) {
      return new Response(JSON.stringify({ error: 'id_cartola obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Mercado status (TTL 60s sempre)
    const mercado = await fetchCached<MercadoStatus>('/mercado/status', 60_000, torneio);
    const isOpen = mercado.status_mercado === 1;

    // 2. Time data (TTL varia por status)
    // If rodada is provided, fetch historical data; otherwise use current behavior
    const timePath = rodadaParam
      ? `/time/id/${idCartola}/${rodadaParam}`
      : `/time/id/${idCartola}`;
    const timeTtl = rodadaParam ? 600_000 : (isOpen ? 300_000 : 30_000);
    const timeData = nocache
      ? await apiFetch<TimeData>(timePath, torneio)
      : await fetchCached<TimeData>(timePath, timeTtl, torneio);
    if (nocache) {
      // refresh in-memory cache too
      setCache(`${resolveTorneioKey(torneio)}:${timePath}`, timeData);
    }

    // 3. Esquemas (TTL 1h - raramente muda)
    const esquemas = await fetchCached<Esquema[]>('/esquemas', 3_600_000, torneio);
    const esquemaAtual = esquemas.find(e => e.esquema_id === timeData.esquema_id);
    const posMap: Record<string, string> = { '1': 'gol', '2': 'lat', '3': 'zag', '4': 'mei', '5': 'ata', '6': 'tec' };
    const esquemaPosicoes = { gol: 1, lat: 2, zag: 2, mei: 4, ata: 2, tec: 1 };
    if (esquemaAtual?.posicoes) {
      for (const [k, v] of Object.entries(esquemaAtual.posicoes)) {
        const mapped = posMap[k];
        if (mapped && mapped in esquemaPosicoes) {
          (esquemaPosicoes as Record<string, number>)[mapped] = v as number;
        }
      }
    }
    const esquemaNome = esquemaAtual?.nome ?? 'Desconhecido';

    const timeInfo = {
      nome: timeData.time.nome,
      cartoleiro: timeData.time.nome_cartola,
      escudo: timeData.time.url_escudo_svg ?? '',
      patrimonio: timeData.patrimonio ?? 0,
      valorizacao: timeData.variacao_patrimonio ?? 0,
      pontos: timeData.pontos ?? 0,
      pontos_total: timeData.pontos_campeonato ?? 0,
    };

    const mercadoOut = {
      rodada_atual: mercado.rodada_atual,
      status_mercado: mercado.status_mercado,
      fechamento: formatFechamento(mercado.fechamento),
    };

    // ── Rodada histórica ───────────────────────────────────────────
    const isHistorical = rodadaParam && Number(rodadaParam) < mercado.rodada_atual;

    if (isHistorical) {
      // For historical rounds, the Cartola API already returns final scores
      // in timeData.atletas[].pontos_num - use them directly
      const mapHistoricalPlayer = (at: TimeAtleta & { pontos_num?: number; variacao_num?: number }): CartolaPlayerOut => ({
        atleta_id: at.atleta_id,
        apelido: at.apelido || '',
        foto: getClubeImage(at.clube_id, torneio),
        posicao_id: at.posicao_id,
        preco_num: at.preco_num ?? 0,
        clube_abreviacao: getClubeAbrev(at.clube_id, torneio),
        clube_escudo: getClubeImage(at.clube_id, torneio),
        pontuacao: at.pontos_num ?? 0,
        variacao_num: at.variacao_num ?? 0,
        media_num: at.media_num ?? 0,
        scout: {},
        entrou_em_campo: true,
        is_capitao: at.atleta_id === timeData.capitao_id,
      });

      const titulares = (timeData.atletas ?? []).map(mapHistoricalPlayer);
      const reservas = ((timeData as any).reservas ?? []).map(mapHistoricalPlayer);

      // Apply captain multiplier
      for (const t of titulares) {
        if (t.is_capitao) {
          t.pontuacao = t.pontuacao * 1.5;
          break;
        }
      }

      return new Response(
        JSON.stringify({
          mercado: mercadoOut,
          time: timeInfo,
          titulares,
          reservas,
          total_parcial: timeData.pontos ?? 0,
          capitao_id: timeData.capitao_id,
          reserva_luxo_id: timeData.reserva_luxo_id ?? null,
          esquema_nome: esquemaNome,
          esquema_posicoes: esquemaPosicoes,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Mercado aberto ──────────────────────────────────────────────
    if (isOpen) {
      const atletasMercado = await fetchCached<{ atletas: AtletaMercado[] }>(
        '/atletas/mercado',
        600_000,
        torneio,
      );

      const mercadoMap = new Map<number, AtletaMercado>();
      for (const a of atletasMercado.atletas ?? []) {
        mercadoMap.set(a.atleta_id, a);
      }

      const mapPlayer = (at: TimeAtleta): CartolaPlayerOut => {
        const mkt = mercadoMap.get(at.atleta_id);
        return {
          atleta_id: at.atleta_id,
          apelido: at.apelido || '',
          foto: getClubeImage(at.clube_id, torneio),
          posicao_id: at.posicao_id,
          preco_num: mkt?.preco_num ?? at.preco_num ?? 0,
          clube_abreviacao: getClubeAbrev(at.clube_id, torneio),
          clube_escudo: getClubeImage(at.clube_id, torneio),
          pontuacao: at.pontos_num ?? 0,
          variacao_num: at.variacao_num ?? 0,
          media_num: at.media_num ?? 0,
          scout: mkt?.scout ?? {},
          entrou_em_campo: false,
          is_capitao: at.atleta_id === timeData.capitao_id,
          status_id: mkt?.status_id,
        };
      };

      const titulares = (timeData.atletas ?? []).map(mapPlayer);
      const reservas = (timeData.reservas ?? []).map(mapPlayer);

      return new Response(
        JSON.stringify({ mercado: mercadoOut, time: timeInfo, titulares, reservas, total_parcial: null, capitao_id: timeData.capitao_id, reserva_luxo_id: timeData.reserva_luxo_id ?? null, esquema_nome: esquemaNome, esquema_posicoes: esquemaPosicoes }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Mercado fechado ─────────────────────────────────────────────
    const pontuadosRaw = await fetchCached<{ atletas: Record<string, AtletaPontuado> }>(
      '/atletas/pontuados',
      30_000,
      torneio,
    );
    const pontuados = pontuadosRaw?.atletas ?? {};

    // Fetch partidas to know which games have finished
    const partidasData = await fetchCached<{ partidas: Record<string, { clube_casa_id: number; clube_visitante_id: number; partida_data: string; status_transmissao_tr: string }> }>(
      '/partidas',
      30_000,
      torneio,
    );
    const jogoFinalizadoMap = new Map<number, boolean>();
    const jogoIniciadoMap = new Map<number, boolean>();
    const now2 = Date.now();
    for (const p of Object.values(partidasData?.partidas ?? {})) {
      const ts = parseBrtTimestamp(p.partida_data);
      const timePassed = !Number.isNaN(ts) && ts <= now2;
      const statusFinished = p.status_transmissao_tr === 'ENCERRADA' || p.status_transmissao_tr === 'POS_JOGO';
      const finished = statusFinished && timePassed;
      jogoFinalizadoMap.set(p.clube_casa_id, finished);
      jogoFinalizadoMap.set(p.clube_visitante_id, finished);
      // Usa apenas o horário oficial; status da API é unreliable.
      const iniciado = timePassed;
      jogoIniciadoMap.set(p.clube_casa_id, iniciado);
      jogoIniciadoMap.set(p.clube_visitante_id, iniciado);
    }

    const { titularesOut, reservasOut, capitaoEfetivo, totalParcial } = computeLineup(
      timeData,
      pontuados,
      jogoIniciadoMap,
      jogoFinalizadoMap,
      torneio,
    );

    return new Response(
      JSON.stringify({
        mercado: mercadoOut,
        time: timeInfo,
        titulares: titularesOut,
        reservas: reservasOut,
        total_parcial: totalParcial,
        capitao_id: capitaoEfetivo,
        reserva_luxo_id: timeData.reserva_luxo_id ?? null,
        esquema_nome: esquemaNome,
        esquema_posicoes: esquemaPosicoes,
      }),
      { headers: { ...corsHeaders, ...noStoreHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('cartola error:', err);
    const unavailable = err instanceof UpstreamUnavailableError;
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Erro interno',
        unavailable,
      }),
      {
        status: unavailable ? 503 : 500,
        headers: { ...corsHeaders, ...noStoreHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

});
