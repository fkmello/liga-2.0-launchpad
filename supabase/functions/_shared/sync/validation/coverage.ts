import type { TournamentCachePayload } from '../../tournament/types.ts';
import type { MatchInput, StandingRow } from '../../standings/types.ts';
import { isLegacyStandingsTeamRow } from '../../cache/legacy/columns.ts';

export interface CoverageReport {
  teams_expected: number;
  teams_loaded: number;
  matches_expected: number;
  matches_loaded: number;
  standings_expected: number;
  standings_generated: number;
  missing_teams: string[];
  missing_matches: string[];
}

function normalizeName(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function teamKeys(payload: TournamentCachePayload | null): Set<string> {
  const out = new Set<string>();
  for (const row of payload?.dados_externos?.rows ?? []) {
    const name = Array.isArray(row) ? row[0] : (row as any)?.team_name ?? (row as any)?.nome;
    const k = normalizeName(name);
    if (k) out.add(k);
  }
  return out;
}

function matchKeysFromPayload(payload: TournamentCachePayload | null): Set<string> {
  const out = new Set<string>();
  for (const [faseKey, fase] of Object.entries<any>(payload?.fases ?? {})) {
    for (const m of fase?.matches ?? fase?.confrontos ?? []) {
      const k = matchKey(faseKey, m.team1 ?? m.home, m.team2 ?? m.away);
      if (k) out.add(k);
    }
    // Fases aninhadas (ex.: fase_grupos → rodada_X)
    if (fase && !Array.isArray(fase.matches)) {
      for (const [sub, subFase] of Object.entries<any>(fase ?? {})) {
        for (const m of subFase?.matches ?? []) {
          const k = matchKey(`${faseKey}.${sub}`, m.team1 ?? m.home, m.team2 ?? m.away);
          if (k) out.add(k);
        }
      }
    }
  }
  return out;
}

function matchKeysFromMatches(matches: MatchInput[]): Set<string> {
  const out = new Set<string>();
  for (const m of matches) {
    const k = matchKey(String(m.round ?? ''), m.homeName ?? m.homeId, m.awayName ?? m.awayId);
    if (k) out.add(k);
  }
  return out;
}

function matchKey(round: string, home: unknown, away: unknown): string | null {
  const h = normalizeName(home);
  const a = normalizeName(away);
  if (!h || !a) return null;
  return `${round}|${h}|${a}`;
}

/**
 * Relatório de cobertura: identifica rapidamente se algum dado deixou de ser
 * carregado pela API, antes mesmo de comparar payloads. Auditoria apenas.
 */
export function buildCoverageReport(input: {
  baseline: TournamentCachePayload | null;
  generated: TournamentCachePayload;
  matches: MatchInput[];
  standings: Record<string, StandingRow[]>;
}): CoverageReport {
  const expectedTeams = teamKeys(input.baseline);
  const loadedTeams = teamKeys(input.generated);
  const expectedMatches = matchKeysFromPayload(input.baseline);
  const loadedMatches = new Set([
    ...matchKeysFromPayload(input.generated),
    ...matchKeysFromMatches(input.matches),
  ]);

  const standings_generated = Object.values(input.standings).reduce((n, r) => n + r.length, 0);
  const standings_expected = Object.values(input.baseline?.classificacao?.grupos ?? {}).reduce(
    (n, r) =>
      n +
      (Array.isArray(r)
        ? r.filter((row) => (Array.isArray(row) ? isLegacyStandingsTeamRow(row) : !!row)).length
        : 0),
    0,
  );

  return {
    teams_expected: expectedTeams.size,
    teams_loaded: loadedTeams.size,
    matches_expected: expectedMatches.size,
    matches_loaded: loadedMatches.size,
    standings_expected,
    standings_generated,
    missing_teams: [...expectedTeams].filter((t) => !loadedTeams.has(t)),
    missing_matches: [...expectedMatches].filter((m) => !loadedMatches.has(m)),
  };
}
