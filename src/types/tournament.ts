/**
 * `NormalizedTournamentData` é a API interna do frontend para dados de torneios.
 *
 * Nenhum componente, hook ou utilitário fora de `useTournamentPayload` pode
 * depender da estrutura do payload consolidado nem da estrutura legada.
 * Toda conversão entre contratos ocorre exclusivamente dentro de
 * `useTournamentPayload` (ou helpers privados dele).
 */

export interface NormalizedMatch {
  team1: string;
  team2: string;
  score1?: string;
  score2?: string;
  matchOrder: number;
  league?: string;
}

export interface NormalizedRound {
  tournament: string;
  round: string;
  matches: NormalizedMatch[];
}

export interface StandingRow {
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  position: number;
}

export interface NormalizedTournamentData {
  /** Confrontos indexados pelo número da rodada. */
  matchesByRound: Record<number, NormalizedRound | undefined>;
  /** Classificação geral já ordenada e com posição recalculada. */
  standings: StandingRow[];
  /** Linhas de dados externos: nome no índice 0, URL do escudo no índice 3. */
  externalRows: string[][];
}
