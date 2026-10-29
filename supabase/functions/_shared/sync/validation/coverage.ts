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

function isAuxiliaryGroupH(groupName: unknown): boolean {
  const normalized = normalizeName(groupName).toUpperCase();
  return normalized === 'H' || normalized === 'GRUPOH';
}

function classificationTeamKeys(payload: TournamentCachePayload | null, excludeGroupH = false): Set<string> {
  const out = new Set<string>();
  for (const [groupName, rows] of Object.entries(payload?.classificacao?.grupos ?? {})) {
    if (excludeGroupH && isAuxiliaryGroupH(groupName)) continue;
    for (const row of Array.isArray(rows) ? rows as unknown[] : []) {
      const name = Array.isArray(row) ? row[2] : (row as any)?.team_name ?? (row as any)?.team ?? (row as any)?.nome ?? (row as any)?.time;
      const k = normalizeName(name);
      if (k) out.add(k);
    }
  }
  return out;
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
 * A Libertadores usa uma matriz própria: [posição, vazio, equipe, pontos,
 * jogos, vitórias, empates, derrotas, saldo] no formato antigo e acrescenta
 * pontos pró antes do saldo no formato novo. Não usar os índices da Série A/B.
 */
function countLibertadoresClassificationRows(payload: TournamentCachePayload | null, excludeGroupH = false): number {
  let count = 0;
  for (const [groupName, rows] of Object.entries(payload?.classificacao?.grupos ?? {})) {
    if (excludeGroupH && isAuxiliaryGroupH(groupName)) continue;
    if (!Array.isArray(rows)) continue;
    for (const row of rows as unknown[]) {
      if (!Array.isArray(row) || row.length < 9) continue;
      const team = String(row[2] ?? '').trim();
      const pointsText = String(row[3] ?? '').trim();
      const points = Number(pointsText.replace(',', '.'));
      if (team && pointsText && Number.isFinite(points)) count++;
    }
  }
  return count;
}

/**
 * Relatório de cobertura: identifica rapidamente se algum dado deixou de ser
 * carregado pela API, antes mesmo de comparar payloads. Auditoria apenas.
 */
export function buildCoverageReport(input: {
  league?: string;
  baseline: TournamentCachePayload | null;
  generated: TournamentCachePayload;
  matches: MatchInput[];
  standings: Record<string, StandingRow[]>;
}): CoverageReport {
  // A Sul-Americana tem sete grupos (A–G). O grupo H legado é apenas um
  // artefato auxiliar e não pode distorcer a cobertura deste torneio.
  const isSulamericana = input.league === 'sulamericana';
  const expectedTeams = isSulamericana
    ? classificationTeamKeys(input.baseline, true)
    : teamKeys(input.baseline);
  const loadedTeams = isSulamericana
    ? classificationTeamKeys(input.generated, true)
    : teamKeys(input.generated);
  const expectedMatches = matchKeysFromPayload(input.baseline);
  const loadedMatches = new Set([
    ...matchKeysFromPayload(input.generated),
    ...matchKeysFromMatches(input.matches),
  ]);

  const genericStandingsCount = Object.values(input.standings).reduce((n, r) => n + r.length, 0);
  const isContinental = input.league === 'libertadores' || isSulamericana;
  const standings_generated = isContinental
    ? countLibertadoresClassificationRows(input.generated, isSulamericana)
    : genericStandingsCount;
  const standings_expected = isContinental
    ? countLibertadoresClassificationRows(input.baseline, isSulamericana)
    : Object.values(input.baseline?.classificacao?.grupos ?? {}).reduce(
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
