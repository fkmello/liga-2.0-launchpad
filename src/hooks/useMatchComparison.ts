import { useQuery } from '@tanstack/react-query';
import { NormalizedPlayer, sortReservesByPosition } from '@/utils/matchComparison';


interface TeamComparisonData {
  nome: string;
  cartoleiro: string;
  escudo: string;
  pontos: number;
  titulares: NormalizedPlayer[];
  reservas: NormalizedPlayer[];
}

export interface MatchComparisonData {
  team1: TeamComparisonData;
  team2: TeamComparisonData;
}

const CARTOLA_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cartola`;
const GURU_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guru-valorizacao`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function fetchTeam(idCartola: string, rodada: number, league?: string | null) {
  const torneioMap: Record<string, string> = { campeoes: 'campeoes', copa_mundo: 'copa' };
  const torneio = league && torneioMap[league] ? `&torneio=${torneioMap[league]}` : '';
  const res = await fetch(
    `${CARTOLA_URL}?id_cartola=${encodeURIComponent(idCartola)}&rodada=${rodada}${torneio}`,
    { headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' } }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchGuruData(): Promise<Record<string, any>> {
  try {
    const res = await fetch(GURU_URL, {
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

function normalizePlayer(
  atleta: any,
  capitaoId?: number,
  reservaLuxoId?: number,
  guruData?: Record<string, any>,
  league?: string | null,
): NormalizedPlayer {
  const isCap = atleta.atleta_id === capitaoId;
  const gameStatus = atleta.game_status as 'not_started' | 'played' | 'not_played' | undefined;

  // API already returns captain score with 1.5x applied
  let pontuacao = atleta.pontuacao ?? 0;
  let pontuacao_base: number | undefined;

  if (isCap && pontuacao !== 0 && gameStatus !== 'not_started') {
    pontuacao_base = Number((pontuacao / 1.5).toFixed(2));
  }

  // Live valuation from Guru do Cartola
  const variacao = (gameStatus === 'played')
    ? (guruData?.[atleta.atleta_id]?.valorizacao ?? 0)
    : 0;

  const foto = atleta.foto || atleta.clube_escudo || '';


  return {
    id: atleta.atleta_id,
    nome: atleta.apelido || '',
    foto,
    posicao_id: atleta.posicao_id,
    clube_id: atleta.clube_id,
    clube_escudo: atleta.clube_escudo || atleta.foto || '',
    preco_num: atleta.preco_num,
    is_capitao: isCap,
    is_reserva_luxo: atleta.atleta_id === reservaLuxoId,
    pontuacao,
    pontuacao_base,
    variacao,
    game_status: gameStatus,
    is_subbed_in: atleta.is_subbed_in ?? false,
    is_subbed_out: atleta.is_subbed_out ?? false,
  };
}


function buildTeamData(
  teamRaw: any,
  statusMercado: number,
  guruData: Record<string, any>,
  league?: string | null,
): TeamComparisonData {
  const capitaoId = teamRaw.capitao_id;
  const reservaLuxoId = teamRaw.reserva_luxo_id;

  const titulares = (teamRaw.titulares || []).map((at: any) =>
    normalizePlayer(at, capitaoId, reservaLuxoId, guruData, league)
  );
  const reservas = sortReservesByPosition(
    (teamRaw.reservas || []).map((at: any) =>
      normalizePlayer(at, capitaoId, reservaLuxoId, guruData, league)
    )
  );

  let pontos: number;
  if (statusMercado === 1) {
    pontos = teamRaw.time?.pontos ?? 0;
  } else {
    pontos = titulares.reduce((sum: number, p: NormalizedPlayer) => sum + p.pontuacao, 0);
  }

  return {
    nome: teamRaw.time?.nome ?? '',
    cartoleiro: teamRaw.time?.cartoleiro ?? '',
    escudo: teamRaw.time?.escudo ?? '',
    pontos,
    titulares,
    reservas,
  };
}

export function useMatchComparison(
  id1: string | null,
  id2: string | null,
  rodada: number | null,
  statusMercado: number | null,
  league?: string | null
) {
  return useQuery<MatchComparisonData>({
    queryKey: ['match-comparison', id1, id2, rodada, statusMercado, league],
    queryFn: async () => {
      if (!id1 || !id2 || !rodada || !statusMercado) {
        throw new Error('Parâmetros inválidos');
      }

      const [team1Raw, team2Raw, guruData] = await Promise.all([
        fetchTeam(id1, rodada, league),
        fetchTeam(id2, rodada, league),
        fetchGuruData(),
      ]);

      const team1 = buildTeamData(team1Raw, statusMercado, guruData, league);
      const team2 = buildTeamData(team2Raw, statusMercado, guruData, league);

      return { team1, team2 };
    },
    enabled: !!id1 && !!id2 && !!rodada && !!statusMercado,
    staleTime: 2 * 60 * 1000,
  });
}
