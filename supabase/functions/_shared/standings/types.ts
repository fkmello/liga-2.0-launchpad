export interface MatchInput {
  /** Agrupador opcional (grupo, chave, série). */
  group?: string;
  /** Rodada/fase opcional. */
  round?: string | number;
  homeId: string;
  awayId: string;
  homeName?: string;
  awayName?: string;
  homeGoals: number | null;
  awayGoals: number | null;
  /** Cartões etc. para desempate disciplinar. */
  homeDisciplinary?: number;
  awayDisciplinary?: number;
}

export interface StandingRow {
  teamId: string;
  teamName: string;
  group?: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  disciplinary: number;
  position: number;
}

export type TiebreakerId =
  | 'points'
  | 'wins'
  | 'goalDiff'
  | 'goalsFor'
  | 'goalsAgainst'
  | 'headToHead'
  | 'disciplinary';

export interface StandingsOptions {
  pointsWin?: number;
  pointsDraw?: number;
  pointsLoss?: number;
  /** Ordem dos critérios de desempate. */
  tiebreakers: TiebreakerId[];
  /** Agrupar resultado por `match.group`. */
  groupBy?: boolean;
}

export interface StandingsContext {
  matches: MatchInput[];
  options: Required<Pick<StandingsOptions, 'pointsWin' | 'pointsDraw' | 'pointsLoss'>> &
    StandingsOptions;
}

export type Comparator = (a: StandingRow, b: StandingRow, ctx: StandingsContext) => number;
