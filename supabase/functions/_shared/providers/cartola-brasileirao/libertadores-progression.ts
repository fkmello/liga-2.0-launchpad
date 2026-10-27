type Match = Record<string, any>;
type PhaseMap = Record<string, any>;
type Classification = { grupos?: Record<string, unknown[]> };

function score(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function filled(value: unknown): boolean { return score(value) !== null; }
function compareRows(a: any[], b: any[]): number {
  return (score(b?.[3]) ?? 0) - (score(a?.[3]) ?? 0)
    || (score(b?.[5]) ?? 0) - (score(a?.[5]) ?? 0)
    || (score(b?.[9]) ?? 0) - (score(a?.[9]) ?? 0)
    || (score(b?.[8]) ?? 0) - (score(a?.[8]) ?? 0);
}
function sameCriteria(a: any[], b: any[]): boolean {
  return compareRows(a, b) === 0;
}
function groupsComplete(fases: PhaseMap): boolean {
  const stage = fases?.['Fase de Grupos'];
  return Array.from({ length: 6 }, (_, i) => stage?.[`rodada_${i + 1}`]).every((round: any) =>
    Array.isArray(round?.groups) && round.groups.length > 0 &&
    round.groups.every((group: any) => Array.isArray(group?.matches) && group.matches.length > 0 &&
      group.matches.every((m: Match) => filled(m.score1) && filled(m.score2))));
}
function getWinner(match: Match): { winner: string; loser: string } | null {
  if (!match?.team1 || !match?.team2) return null;
  const i1 = score(match.scoreIda1), i2 = score(match.scoreIda2);
  const v1 = score(match.scoreVolta1), v2 = score(match.scoreVolta2);
  if ([i1, i2, v1, v2].some(v => v === null)) return null;
  const total1 = i1! + v1!, total2 = i2! + v2!;
  if (total1 === total2) return null;
  return total1 > total2
    ? { winner: String(match.team1), loser: String(match.team2) }
    : { winner: String(match.team2), loser: String(match.team1) };
}
function replaceTeams(phase: any, pairs: Array<[string, string]>): any {
  if (!phase || !Array.isArray(phase.matches) || phase.matches.length !== pairs.length) return phase;
  return { ...phase, matches: phase.matches.map((match: Match, i: number) => ({
    ...match, team1: pairs[i][0], team2: pairs[i][1],
  })) };
}
function resolveRound(fases: PhaseMap, fromName: string, toName: string): PhaseMap {
  const source = fases[fromName];
  const target = fases[toName];
  if (!Array.isArray(source?.matches) || !Array.isArray(target?.matches)) return fases;
  const resolved = source.matches.map(getWinner);
  if (resolved.some((r: any) => !r)) return fases;
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < resolved.length; i += 2) {
    if (!resolved[i + 1]) return fases;
    pairs.push([resolved[i]!.winner, resolved[i + 1]!.winner]);
  }
  if (pairs.length !== target.matches.length) return fases;
  return { ...fases, [toName]: replaceTeams(target, pairs) };
}

/**
 * Builds the Libertadores bracket only when source results are complete and ties are absent.
 * Manual tie-break decisions are intentionally not inferred from scores.
 */
export function resolveLibertadoresProgression(
  inputFases: PhaseMap,
  classification: Classification,
): PhaseMap {
  let fases = inputFases ?? {};
  if (groupsComplete(fases)) {
    const groups = Object.entries(classification?.grupos ?? {});
    const qualifiers: any[][] = [];
    for (const [, rowsRaw] of groups) {
      const rows = (rowsRaw as any[][]).filter(row => String(row?.[2] ?? '').trim()).sort(compareRows);
      if (rows.length < 2) return fases;
      // If second and third are tied on every official criterion, manual draw is required.
      if (rows[2] && sameCriteria(rows[1], rows[2])) return fases;
      qualifiers.push(rows[0], rows[1]);
    }
    qualifiers.sort(compareRows);
    if (qualifiers.length !== 16) return fases;
    // A complete tie between seeded teams requires a manual draw before creating the bracket.
    for (let i = 1; i < qualifiers.length; i++) {
      if (sameCriteria(qualifiers[i - 1], qualifiers[i])) return fases;
    }
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < 8; i++) {
      const team1 = String(qualifiers[i]?.[2] ?? '').trim();
      const team2 = String(qualifiers[15 - i]?.[2] ?? '').trim();
      if (!team1 || !team2) return fases;
      pairs.push([team1, team2]);
    }
    fases = { ...fases, 'Oitavas de Final': replaceTeams(fases['Oitavas de Final'], pairs) };
  }
  fases = resolveRound(fases, 'Oitavas de Final', 'Quartas de Final');
  fases = resolveRound(fases, 'Quartas de Final', 'Semifinal');

  const semifinal = fases.Semifinal;
  const final = fases.Final;
  if (Array.isArray(semifinal?.matches) && Array.isArray(final?.matches)) {
    const resolved = semifinal.matches.map(getWinner);
    if (resolved.length === 2 && resolved.every(Boolean)) {
      const finalPairs: Array<[string, string]> = [
        [resolved[0]!.winner, resolved[1]!.winner],
        [resolved[0]!.loser, resolved[1]!.loser],
      ];
      const finalMatches = final.matches.map((m: Match) => {
        const label = String(m.matchNumber ?? '').toLocaleUpperCase('pt-BR');
        if (label === 'FINAL') return { ...m, team1: finalPairs[0][0], team2: finalPairs[0][1] };
        if (label.includes('3') && label.includes('LUGAR')) return { ...m, team1: finalPairs[1][0], team2: finalPairs[1][1] };
        return m;
      });
      fases = { ...fases, Final: { ...final, matches: finalMatches } };
    }
  }
  return fases;
}
