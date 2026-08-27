export type AppRole = 'admin' | 'moderator' | 'user';
export type RoundStatus = 'upcoming' | 'open' | 'closed' | 'finished';
export type TournamentStatus = 'draft' | 'active' | 'finished';
export type TournamentType = 'mata_mata' | 'pontos_corridos' | 'turno_returno';
export type PlayerPosition = 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA' | 'TEC';

export interface Profile {
  id: string;
  user_id: string;
  team_name: string;
  cartoleiro_name: string;
  patrimony: number;
  team_value: number;
  balance: number;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Player {
  id: string;
  profile_id: string;
  round_id: string;
  name: string;
  position: PlayerPosition;
  club: string;
  club_badge_url?: string;
  price: number;
  photo_url?: string;
  is_captain: boolean;
  is_reserve: boolean;
  points: number;
  created_at: string;
}

export interface Round {
  id: string;
  number: number;
  status: RoundStatus;
  market_close_time?: string;
  created_at: string;
}

export interface Ranking {
  id: string;
  profile_id: string;
  round_id: string;
  round_points: number;
  total_points: number;
  position?: number;
  created_at: string;
  profile?: Profile;
}

export interface Tournament {
  id: string;
  name: string;
  type: TournamentType;
  status: TournamentStatus;
  description?: string;
  start_round?: number;
  end_round?: number;
  created_at: string;
}

export interface TournamentMatch {
  id: string;
  tournament_id: string;
  round: number;
  player1_id?: string;
  player2_id?: string;
  player1_score?: number;
  player2_score?: number;
  winner_id?: string;
  match_order: number;
  created_at: string;
  player1?: Profile;
  player2?: Profile;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface InviteCode {
  id: string;
  code: string;
  team_data: Array<{ team_name: string; id_cartola: string; serie: string }>;
  created_by?: string;
  used_by?: string;
  used_at?: string;
  expires_at: string;
  created_at: string;
}

export interface UserTeam {
  id: string;
  user_id: string;
  id_cartola: string;
  team_name: string;
  serie?: string;
  league?: string;
  created_at: string;
}

export interface CartolaPlayer {
  atleta_id: number;
  apelido: string;
  foto: string;
  posicao_id: number;
  preco_num: number;
  clube_abreviacao: string;
  clube_escudo: string;
  pontuacao: number;
  scout: Record<string, number>;
  entrou_em_campo: boolean;
  is_capitao: boolean;
  status_id?: number;
  variacao_num?: number;
  game_status?: 'not_started' | 'played' | 'not_played';
  is_subbed_in?: boolean;
  is_subbed_out?: boolean;
}

export interface CartolaTeamData {
  mercado: {
    rodada_atual: number;
    status_mercado: number;
    fechamento: string;
  };
  time: {
    nome: string;
    cartoleiro: string;
    escudo: string;
    patrimonio: number;
    valorizacao: number;
    pontos: number;
    pontos_total: number;
  };
  titulares: CartolaPlayer[];
  reservas: CartolaPlayer[];
  total_parcial: number | null;
  capitao_id: number;
  reserva_luxo_id: number | null;
  esquema_nome: string;
  esquema_posicoes: { gol: number; lat: number; zag: number; mei: number; ata: number; tec: number };
}
