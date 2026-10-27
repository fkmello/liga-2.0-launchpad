import type { AdapterContext, TournamentAdapter } from '../../tournament/types.ts';
import { KnownProviders } from '../../sync/providers.ts';
import { fetchCartolaTeams, fetchMercadoStatus, fetchTeamsRoundScores, type CartolaTeamRaw } from './api-client.ts';

type ContinentalMatch = Record<string, any>;
type ContinentalFases = Record<string, any>;
type RoundTarget = { kind: 'group'; groupRound: number } | { kind: 'knockout'; fase: string; leg: 'ida' | 'volta' | 'unico' };
interface LibertadoresRaw {
  fases: ContinentalFases;
  classificacao: { grupos: Record<string, unknown[]> };
  teams: CartolaTeamRaw[];
}

const ROUND_TO_TARGET: Record<number, RoundTarget> = {
  11: { kind: 'group', groupRound: 1 }, 12: { kind: 'group', groupRound: 2 },
  14: { kind: 'group', groupRound: 3 }, 15: { kind: 'group', groupRound: 4 },
  17: { kind: 'group', groupRound: 5 }, 18: { kind: 'group', groupRound: 6 },
  23: { kind: 'knockout', fase: 'Oitavas de Final', leg: 'ida' },
  24: { kind: 'knockout', fase: 'Oitavas de Final', leg: 'volta' },
  27: { kind: 'knockout', fase: 'Quartas de Final', leg: 'ida' },
  28: { kind: 'knockout', fase: 'Quartas de Final', leg: 'volta' },
  31: { kind: 'knockout', fase: 'Semifinal', leg: 'ida' },
  32: { kind: 'knockout', fase: 'Semifinal', leg: 'volta' },
  37: { kind: 'knockout', fase: 'Final', leg: 'unico' },
};

/** Rodadas da API que correspondem a fases mapeadas da Libertadores. */
export const LIBERTADORES_SYNCABLE_TARGET_ROUNDS = Object.keys(ROUND_TO_TARGET).map(Number);

/** Só recalcula a classificação quando a rodada-alvo pertence à fase de grupos. */
export function shouldRecalculateLibertadoresClassification(targetRound: number | null): boolean {
  return targetRound !== null && ROUND_TO_TARGET[targetRound]?.kind === 'group';
}

function normalizeName(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
function toScore(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const score = Number(String(value).replace(',', '.'));
  return Number.isFinite(score) ? score.toFixed(2).replace('.', ',') : null;
}
function externalRows(ctx: AdapterContext): unknown[] { return (ctx.previous?.dados_externos?.rows ?? []) as unknown[]; }
function rowName(row: any): string { return String(Array.isArray(row) ? row[0] ?? '' : row?.nome ?? row?.team_name ?? row?.time ?? '').trim(); }
function rowId(row: any): string {
  const value = Array.isArray(row) ? row[1] : row?.id_cartola ?? row?.id;
  return value === null || value === undefined ? '' : String(value).trim();
}
function extractIds(ctx: AdapterContext): string[] { return [...new Set(externalRows(ctx).map(rowId).filter(Boolean))]; }
function buildIdByName(ctx: AdapterContext): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of externalRows(ctx)) {
    const name = normalizeName(rowName(row));
    const id = rowId(row);
    if (name && id && !map.has(name)) map.set(name, id);
  }
  return map;
}
function scoreForTeam(name: unknown, scores: Map<string, number | null>, idByName: Map<string, string>): string | null {
  const id = idByName.get(normalizeName(name));
  return id ? toScore(scores.get(id)) : null;
}

/** Atualiza exclusivamente a rodada-alvo; pontuações ausentes nunca apagam dados anteriores. */
export function updateLibertadoresFases(
  fases: ContinentalFases, targetRound: number | null,
  scores: Map<string, number | null>, idByName: Map<string, string>,
): ContinentalFases {
  const target = targetRound === null ? undefined : ROUND_TO_TARGET[targetRound];
  if (!target) return fases;

  if (target.kind === 'group') {
    const groupStage = fases['Fase de Grupos'];
    const roundKey = `rodada_${target.groupRound}`;
    const round = groupStage?.[roundKey];
    if (!round || !Array.isArray(round.groups)) return fases;
    const updatedRound = {
      ...round,
      groups: round.groups.map((group: any) => ({
        ...group,
        matches: Array.isArray(group.matches) ? group.matches.map((match: ContinentalMatch) => {
          const score1 = scoreForTeam(match.team1, scores, idByName);
          const score2 = scoreForTeam(match.team2, scores, idByName);
          return { ...match, ...(score1 !== null ? { score1 } : {}), ...(score2 !== null ? { score2 } : {}) };
        }) : group.matches,
      })),
    };
    return { ...fases, 'Fase de Grupos': { ...groupStage, [roundKey]: updatedRound } };
  }

  const phase = fases[target.fase];
  if (!phase || !Array.isArray(phase.matches)) return fases;
  // A final/terceiro lugar é jogo único. Para compatibilidade com o cache e a tela,
  // seus placares ficam em scoreIda1/scoreIda2 (os campos usados como placar principal).
  const scoreKey1 = target.leg === 'volta' ? 'scoreVolta1' : 'scoreIda1';
  const scoreKey2 = target.leg === 'volta' ? 'scoreVolta2' : 'scoreIda2';
  return {
    ...fases,
    [target.fase]: {
      ...phase,
      matches: phase.matches.map((match: ContinentalMatch) => {
        const score1 = scoreForTeam(match.team1, scores, idByName);
        const score2 = scoreForTeam(match.team2, scores, idByName);
        return { ...match, ...(score1 !== null ? { [scoreKey1]: score1 } : {}), ...(score2 !== null ? { [scoreKey2]: score2 } : {}) };
      }),
    },
  };
}


function parseKnockoutScore(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const score = Number(String(value).replace(',', '.'));
  return Number.isFinite(score) ? score : null;
}

/**
 * Depois dos dois jogos da semifinal, preenche os classificados para a final
 * e os eliminados para a disputa do terceiro lugar. Se houver placar faltando
 * ou empate no agregado, não inventa classificação nem apaga os nomes existentes.
 */
export function resolveLibertadoresFinalists(fases: ContinentalFases): ContinentalFases {
  const semifinal = fases?.Semifinal;
  const final = fases?.Final;
  if (!Array.isArray(semifinal?.matches) || !Array.isArray(final?.matches)) return fases;

  const qualifiers = semifinal.matches.map((match: ContinentalMatch) => {
    const ida1 = parseKnockoutScore(match.scoreIda1);
    const ida2 = parseKnockoutScore(match.scoreIda2);
    const volta1 = parseKnockoutScore(match.scoreVolta1);
    const volta2 = parseKnockoutScore(match.scoreVolta2);
    if (!match.team1 || !match.team2 || ida1 === null || ida2 === null || volta1 === null || volta2 === null) return null;

    const total1 = ida1 + volta1;
    const total2 = ida2 + volta2;
    if (total1 === total2) return null;
    return total1 > total2
      ? { winner: String(match.team1), loser: String(match.team2) }
      : { winner: String(match.team2), loser: String(match.team1) };
  });

  if (qualifiers.length < 2 || !qualifiers[0] || !qualifiers[1]) return fases;

  const finalMatches = final.matches.map((match: ContinentalMatch) => {
    const label = String(match.matchNumber ?? '').toLocaleUpperCase('pt-BR');
    if (label === 'FINAL') {
      return { ...match, team1: qualifiers[0]!.winner, team2: qualifiers[1]!.winner };
    }
    if (label.includes('3') && label.includes('LUGAR')) {
      return { ...match, team1: qualifiers[0]!.loser, team2: qualifiers[1]!.loser };
    }
    return match;
  });

  return { ...fases, Final: { ...final, matches: finalMatches } };
}


type GroupStanding = { team: string; points: number; played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; goalDiff: number };

function parseFantasyScore(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const score = Number(String(value).replace(',', '.'));
  return Number.isFinite(score) ? score : null;
}

function formatStandingScore(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/**
 * Recalcula a classificação apenas a partir dos placares dos jogos da fase de grupos.
 * Os dois primeiros e os terceiros colocados são ordenados pela mesma regra usada na tela:
 * pontos, vitórias e saldo de pontos Cartola.
 */
export function recalculateLibertadoresClassification(
  fases: ContinentalFases,
  previousClassification: { grupos: Record<string, unknown[]> },
): { grupos: Record<string, unknown[]> } {
  const groupMatches = new Map<string, Map<string, GroupStanding>>();

  // Preserve group/team identities from the existing table, including teams whose matches
  // have not yet received scores in the available rounds.
  for (const [groupName, rows] of Object.entries(previousClassification?.grupos ?? {})) {
    const standings = new Map<string, GroupStanding>();
    for (const row of rows as any[]) {
      const team = String(Array.isArray(row) ? row[2] ?? '' : '').trim();
      if (!team) continue;
      standings.set(team, {
        team,
        points: 0,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
      });
    }
    groupMatches.set(groupName, standings);
  }

  for (let round = 1; round <= 6; round++) {
    const roundData = fases?.['Fase de Grupos']?.[`rodada_${round}`];
    if (!Array.isArray(roundData?.groups)) continue;
    for (const group of roundData.groups as any[]) {
      const groupName = String(group?.name ?? '').trim() || 'Grupo';
      let standings = groupMatches.get(groupName);
      if (!standings) {
        standings = new Map<string, GroupStanding>();
        groupMatches.set(groupName, standings);
      }
      for (const match of Array.isArray(group?.matches) ? group.matches : []) {
        const team1 = String(match?.team1 ?? '').trim();
        const team2 = String(match?.team2 ?? '').trim();
        if (!team1 || !team2) continue;
        if (!standings.has(team1)) standings.set(team1, { team: team1, points: 0, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0 });
        if (!standings.has(team2)) standings.set(team2, { team: team2, points: 0, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0 });

        const score1 = parseFantasyScore(match?.score1);
        const score2 = parseFantasyScore(match?.score2);
        if (score1 === null || score2 === null) continue;

        const a = standings.get(team1)!;
        const b = standings.get(team2)!;
        a.played++; b.played++;
        a.goalsFor += score1; a.goalsAgainst += score2;
        b.goalsFor += score2; b.goalsAgainst += score1;
        a.goalDiff += score1 - score2;
        b.goalDiff += score2 - score1;
        if (score1 > score2) { a.points += 3; a.wins++; b.losses++; }
        else if (score2 > score1) { b.points += 3; b.wins++; a.losses++; }
        else { a.points++; b.points++; a.draws++; b.draws++; }
      }
    }
  }

  const compare = (a: GroupStanding, b: GroupStanding) =>
    b.points - a.points || b.wins - a.wins || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor;

  const grupos: Record<string, unknown[]> = {};
  for (const [groupName, standings] of groupMatches) {
    grupos[groupName] = [...standings.values()]
      .sort(compare)
      .map((team, index) => [
        String(index + 1), '', team.team, String(team.points), String(team.played),
        String(team.wins), String(team.draws), String(team.losses), formatStandingScore(team.goalsFor), formatStandingScore(team.goalDiff),
      ]);
  }
  return { grupos };
}

/** Mantém a classificação anterior intacta em rodadas eliminatórias ou não mapeadas. */
export function resolveLibertadoresClassification(
  fases: ContinentalFases,
  targetRound: number | null,
  previousClassification: { grupos: Record<string, unknown[]> },
): { grupos: Record<string, unknown[]> } {
  if (!shouldRecalculateLibertadoresClassification(targetRound)) return previousClassification;
  const recalculated = recalculateLibertadoresClassification(fases, previousClassification);
  return { ...recalculated, desempatesManuais: (previousClassification as any)?.desempatesManuais };
}


type StandingRow = { team: string; points: number; wins: number; goalDiff: number; goalsFor: number; group: string };

function standingValue(row: unknown[], index: number): number {
  const value = row[index];
  const parsed = Number(String(value ?? '0').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareStanding(a: StandingRow, b: StandingRow): number {
  return b.points - a.points || b.wins - a.wins || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor;
}

function allGroupMatchesComplete(fases: ContinentalFases): boolean {
  const stage = fases?.['Fase de Grupos'];
  if (!stage) return false;
  for (let round = 1; round <= 6; round++) {
    const groups = stage[`rodada_${round}`]?.groups;
    if (!Array.isArray(groups) || groups.length === 0) return false;
    for (const group of groups) {
      if (!Array.isArray(group?.matches) || group.matches.length === 0) return false;
      if (group.matches.some((match: any) =>
        parseFantasyScore(match?.score1) === null || parseFantasyScore(match?.score2) === null
      )) return false;
    }
  }
  return true;
}

function qualifiedGroupTeams(classification: { grupos: Record<string, unknown[]>; desempatesManuais?: { grupos?: Record<string, string[]>; global?: string[] } }): StandingRow[] | null {
  const qualified: StandingRow[] = [];
  for (const [group, rows] of Object.entries(classification?.grupos ?? {})) {
    const manualOrder = classification.desempatesManuais?.grupos?.[group] ?? [];
    const manualRank = new Map(manualOrder.map((team, index) => [team, index]));
    const compareRows = (a: unknown[], b: unknown[]) =>
      standingValue(b, 3) - standingValue(a, 3) ||
      standingValue(b, 5) - standingValue(a, 5) ||
      standingValue(b, 9) - standingValue(a, 9) ||
      standingValue(b, 8) - standingValue(a, 8);
    const sorted = [...(rows as unknown[][])].sort((a, b) => {
      const criteria = compareRows(a, b);
      if (criteria !== 0) return criteria;
      const rankA = manualRank.get(String(a[2] ?? '').trim());
      const rankB = manualRank.get(String(b[2] ?? '').trim());
      return rankA === undefined || rankB === undefined ? 0 : rankA - rankB;
    });
    if (sorted.length < 2) return null;
    // Any complete tie in a group needs a manual draw before ranking can be trusted.
    for (let i = 1; i < sorted.length; i++) {
      const tied = compareRows(sorted[i - 1], sorted[i]) === 0;
      const previousTeam = String(sorted[i - 1][2] ?? '').trim();
      const currentTeam = String(sorted[i][2] ?? '').trim();
      if (tied && (!manualRank.has(previousTeam) || !manualRank.has(currentTeam) ||
          manualRank.get(previousTeam) === manualRank.get(currentTeam))) return null;
    }
    for (let i = 0; i < Math.min(2, sorted.length); i++) {
      const row = sorted[i];
      qualified.push({
        team: String(row[2] ?? '').trim(),
        points: standingValue(row, 3),
        wins: standingValue(row, 5),
        goalDiff: standingValue(row, 9),
        goalsFor: standingValue(row, 8),
        group,
      });
    }
  }
  if (qualified.length !== 16 || qualified.some(row => !row.team)) return null;
  const globalOrder = classification.desempatesManuais?.global ?? [];
  const globalRank = new Map(globalOrder.map((team, index) => [team, index]));
  qualified.sort((a, b) => {
    const criteria = compareStanding(a, b);
    if (criteria !== 0) return criteria;
    const rankA = globalRank.get(a.team);
    const rankB = globalRank.get(b.team);
    return rankA === undefined || rankB === undefined ? 0 : rankA - rankB;
  });
  // A complete tie between qualified teams needs an explicit global draw decision.
  for (let i = 1; i < qualified.length; i++) {
    if (compareStanding(qualified[i - 1], qualified[i]) === 0 &&
        (!globalRank.has(qualified[i - 1].team) || !globalRank.has(qualified[i].team) ||
         globalRank.get(qualified[i - 1].team) === globalRank.get(qualified[i].team))) return null;
  }
  return qualified;
}

function resolveTwoLeggedMatch(match: ContinentalMatch): { winner: string; loser: string } | null {
  if (!match?.team1 || !match?.team2) return null;
  const ida1 = parseKnockoutScore(match.scoreIda1);
  const ida2 = parseKnockoutScore(match.scoreIda2);
  const volta1 = parseKnockoutScore(match.scoreVolta1);
  const volta2 = parseKnockoutScore(match.scoreVolta2);
  if (ida1 === null || ida2 === null || volta1 === null || volta2 === null) return null;
  // A manually selected winner is kept in the match object, independently of API scores.
  if (match.manualWinner === match.team1) return { winner: String(match.team1), loser: String(match.team2) };
  if (match.manualWinner === match.team2) return { winner: String(match.team2), loser: String(match.team1) };
  const total1 = ida1 + volta1;
  const total2 = ida2 + volta2;
  if (total1 === total2) return null;
  return total1 > total2
    ? { winner: String(match.team1), loser: String(match.team2) }
    : { winner: String(match.team2), loser: String(match.team1) };
}

function replaceMatchTeams(match: ContinentalMatch, team1: string, team2: string): ContinentalMatch {
  if (match.team1 === team1 && match.team2 === team2) return match;
  // Do not carry scores from a different pairing into newly generated fixtures.
  const next = { ...match, team1, team2 };
  for (const field of ['scoreIda1', 'scoreIda2', 'scoreVolta1', 'scoreVolta2']) {
    next[field] = '';
  }
  delete next.manualWinner;
  return next;
}

/**
 * Progresses the Libertadores bracket without inventing results. Manual draw decisions
 * live on each match as manualWinner, separate from API score fields.
 */
export function resolveLibertadoresProgression(
  fases: ContinentalFases,
  classification: { grupos: Record<string, unknown[]>; desempatesManuais?: { grupos?: Record<string, string[]>; global?: string[] } },
): ContinentalFases {
  let next = fases;
  if (allGroupMatchesComplete(next)) {
    const qualified = qualifiedGroupTeams(classification);
    // A completed group stage with unresolved manual ties must block all dependent rounds.
    if (!qualified) return next;
    const phase = next['Oitavas de Final'];
    if (Array.isArray(phase?.matches) && phase.matches.length === 8) {
      const matches = phase.matches.map((match: ContinentalMatch, index: number) =>
        replaceMatchTeams(match, qualified[index].team, qualified[15 - index].team)
      );
      next = { ...next, 'Oitavas de Final': { ...phase, matches } };
    }
  }

  const phases = [
    { source: 'Oitavas de Final', target: 'Quartas de Final' },
    { source: 'Quartas de Final', target: 'Semifinal' },
  ];
  for (const { source, target } of phases) {
    const sourceMatches = next?.[source]?.matches;
    const targetPhase = next?.[target];
    const expectedSourceMatches = source === 'Oitavas de Final' ? 8 : 4;
    if (!Array.isArray(sourceMatches) || !Array.isArray(targetPhase?.matches) ||
        sourceMatches.length !== expectedSourceMatches) continue;
    const winners = sourceMatches.map((match: ContinentalMatch) => resolveTwoLeggedMatch(match));
    if (winners.some((winner: any) => !winner)) continue;
    const pairs = [];
    for (let i = 0; i < winners.length; i += 2) {
      pairs.push([winners[i].winner, winners[i + 1].winner]);
    }
    const matches = targetPhase.matches.map((match: ContinentalMatch, index: number) =>
      pairs[index] ? replaceMatchTeams(match, pairs[index][0], pairs[index][1]) : match
    );
    next = { ...next, [target]: { ...targetPhase, matches } };
  }

  const semifinal = next?.Semifinal?.matches;
  const final = next?.Final;
  if (Array.isArray(semifinal) && Array.isArray(final?.matches)) {
    const qualifiers = semifinal.map((match: ContinentalMatch) => {
      const result = resolveTwoLeggedMatch(match);
      return result ? { winner: result.winner, loser: result.loser } : null;
    });
    if (qualifiers.length >= 2 && qualifiers[0] && qualifiers[1]) {
      const matches = final.matches.map((match: ContinentalMatch) => {
        const label = String(match.matchNumber ?? '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toUpperCase();
        if (label === 'FINAL') return replaceMatchTeams(match, qualifiers[0]!.winner, qualifiers[1]!.winner);
        if (label.includes('3') && label.includes('LUGAR')) return replaceMatchTeams(match, qualifiers[0]!.loser, qualifiers[1]!.loser);
        return match;
      });
      next = { ...next, Final: { ...final, matches } };
    }
  }
  return next;
}

export const cartolaLibertadoresAdapter: TournamentAdapter<LibertadoresRaw> = {
  id: 'cartola_brasileirao_libertadores_v1',
  provider: KnownProviders.CARTOLA_BRASILEIRAO,
  source_type: 'api',
  async fetchRaw(ctx) {
    let targetRound: number | null = null;
    if (ctx.scope.kind === 'rodada') targetRound = ctx.scope.rodada;
    else if (ctx.scope.kind !== 'dados_externos') {
      const market = await fetchMercadoStatus();
      targetRound = market.rodada_atual === null ? null
        : market.status_mercado === 1 ? market.rodada_atual - 1
        : market.status_mercado === 2 ? market.rodada_atual : null;
    }

    if (ctx.scope.kind === 'fase') {
      const target = targetRound === null ? undefined : ROUND_TO_TARGET[targetRound];
      const targetPhase = target?.kind === 'group' ? 'Fase de Grupos' : target?.fase;
      if (!target || targetPhase !== ctx.scope.fase) {
        throw new Error(`Não é possível atualizar a fase "${ctx.scope.fase}" pela rodada ${targetRound ?? 'indisponível'}. Informe scope=rodada com a rodada de ida/volta desejada.`);
      }
    }

    const ids = extractIds(ctx);
    const teams = ids.length ? await fetchCartolaTeams(ids) : [];
    const target = targetRound === null ? undefined : ROUND_TO_TARGET[targetRound];
    const scores = target && targetRound !== null
      ? await fetchTeamsRoundScores(ids, targetRound)
      : new Map<string, number | null>();
    const updatedFases = updateLibertadoresFases(
      (ctx.previous?.fases ?? {}) as ContinentalFases,
      targetRound,
      scores,
      buildIdByName(ctx),
    );
    // Reavalia os classificados sempre que houver placares completos das duas semifinais.
    // A função não altera a fase Final enquanto os agregados não puderem ser determinados.
    const previousClassification = ctx.previous?.classificacao ?? { grupos: {} };
    const updatedClassification = resolveLibertadoresClassification(updatedFases, targetRound, previousClassification);
    const progressedFases = resolveLibertadoresProgression(updatedFases, updatedClassification);

    return { fases: progressedFases, classificacao: updatedClassification, teams };
  },
  toFases(raw) { return raw.fases; },
  toClassificacao(raw) { return raw.classificacao; },
  toDadosExternos(raw, ctx) {
    const byId = new Map(raw.teams.map((team) => [team.id_cartola, team]));
    const previousRows = externalRows(ctx);
    if (!previousRows.length) return { rows: raw.teams.map((team) => [team.nome, team.id_cartola, team.escudo ?? '']) };
    return { rows: previousRows.map((row: any) => {
      const team = byId.get(rowId(row));
      if (!team?.escudo || !Array.isArray(row)) return row;
      const next = [...row]; next[2] = team.escudo; return next;
    }) };
  },
  toMatches() { return []; },
};
