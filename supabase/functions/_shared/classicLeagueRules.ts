export const CLASSIC_LEAGUE_EXPECTED_TEAMS = 60;

export type ClassicLeagueMarketStatus = {
  status_mercado: number;
  rodada_atual: number;
};

export type ClassicLeagueRosterTeam = {
  id: string;
  name: string;
  badge: string | null;
};

export function resolveClassicLeagueCompletedRound(market: ClassicLeagueMarketStatus): number {
  const status = Number(market.status_mercado);
  const currentRound = Number(market.rodada_atual);

  if (!Number.isInteger(currentRound) || currentRound < 1 || currentRound > 38) {
    throw new Error('Rodada atual retornada pela API Cartola é inválida.');
  }

  // A rodada 38 é exceção: após o encerramento definitivo não existe R39.
  if (status === 6 && currentRound === 38) return 38;
  if (status === 1 && currentRound > 1) return currentRound - 1;
  if (status === 1 && currentRound === 1) {
    throw new Error('Ainda não existe rodada concluída nesta temporada.');
  }
  if (status === 2) throw new Error('Mercado fechado; não há confirmação segura de rodada concluída.');
  if (status === 4) throw new Error('Mercado em manutenção; sincronização bloqueada.');
  if (status === 6) throw new Error('Temporada finalizada sem confirmação da rodada 38.');
  throw new Error(`Status de mercado não elegível para sincronização: ${status}.`);
}

export function parseClassicLeagueRoster(data: unknown): ClassicLeagueRosterTeam[] {
  const root = (data ?? {}) as { raw?: unknown };
  if (!Array.isArray(root.raw)) {
    throw new Error('Cache dados_externos:liga_classica sem campo raw válido.');
  }

  const teams: ClassicLeagueRosterTeam[] = [];
  for (const row of root.raw as unknown[][]) {
    if (!Array.isArray(row)) continue;
    const id = String(row[3] ?? '').trim();
    const name = String(row[2] ?? '').trim();
    if (!/^\\d+$/.test(id) || !name) continue;
    teams.push({ id, name, badge: String(row[5] ?? '').trim() || null });
  }

  const uniqueIds = new Set(teams.map((team) => team.id));
  if (teams.length !== CLASSIC_LEAGUE_EXPECTED_TEAMS || uniqueIds.size !== CLASSIC_LEAGUE_EXPECTED_TEAMS) {
    throw new Error(
      `Cadastro da Liga Clássica inválido: esperados ${CLASSIC_LEAGUE_EXPECTED_TEAMS} times e IDs únicos; encontrados ${teams.length} linhas válidas e ${uniqueIds.size} IDs.`,
    );
  }

  return teams;
}
