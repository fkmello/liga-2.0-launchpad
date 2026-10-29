import type { AdapterContext, TournamentAdapter } from '../../tournament/types.ts';
import { KnownProviders } from '../../sync/providers.ts';
import {
  fetchCartolaTeams,
  fetchMercadoStatus,
  fetchTeamsRoundScores,
  type CartolaTeamRaw,
} from '../cartola-brasileirao/api-client.ts';

type CupMatch = Record<string, any>;
type CupFases = Record<string, { matches?: CupMatch[]; [key: string]: unknown }>;

interface CopaBrasilRaw {
  fases: CupFases;
  teams: CartolaTeamRaw[];
}

type CupLeg = 'ida' | 'volta';

const ROUND_TO_PHASE_LEG: Record<number, { fase: string; leg: CupLeg }> = {
  5: { fase: '1ª Fase', leg: 'ida' },
  7: { fase: '1ª Fase', leg: 'volta' },
  13: { fase: '2ª Fase', leg: 'ida' },
  16: { fase: '2ª Fase', leg: 'volta' },
  21: { fase: 'Oitavas de Final', leg: 'ida' },
  22: { fase: 'Oitavas de Final', leg: 'volta' },
  25: { fase: 'Quartas de Final', leg: 'ida' },
  26: { fase: 'Quartas de Final', leg: 'volta' },
  34: { fase: 'Semifinal', leg: 'ida' },
  35: { fase: 'Semifinal', leg: 'volta' },
  38: { fase: 'Final', leg: 'ida' },
};

/** Rodadas da API que correspondem a fases mapeadas da Copa do Brasil. */
export const COPA_BRASIL_SYNCABLE_TARGET_ROUNDS = Object.keys(ROUND_TO_PHASE_LEG).map(Number);

function normalizeName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function toScore(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const score = Number(String(value).replace(',', '.'));
  return Number.isFinite(score) ? score.toFixed(2).replace('.', ',') : null;
}

function externalRows(ctx: AdapterContext): unknown[] {
  return (ctx.previous?.dados_externos?.rows ?? []) as unknown[];
}

function rowName(row: any): string {
  const value = Array.isArray(row) ? row[0] : row?.nome ?? row?.team_name ?? row?.time;
  const name = String(value ?? '').trim();
  return /^\\d+$/.test(name) ? '' : name;
}

function rowId(row: any): string {
  const value = Array.isArray(row)
    ? (row[1] && /^\\d+$/.test(String(row[1]).trim()) ? row[1] : row.find((cell: unknown) => /^\\d{3,}$/.test(String(cell ?? '').trim())))
    : row?.id_cartola ?? row?.id;
  return value === null || value === undefined ? '' : String(value).trim();
}

function rowRole(row: any): 'preliminar' | 'convidado' | '' {
  const value = Array.isArray(row) ? row[3] : row?.role ?? row?.origem;
  const role = String(value ?? '').trim().toLowerCase();
  if (role.includes('convid')) return 'convidado';
  if (role.includes('prelim')) return 'preliminar';
  return '';
}

function extractIds(ctx: AdapterContext): string[] {
  return [...new Set(externalRows(ctx).map(rowId).filter(Boolean))];
}

function buildIdByName(ctx: AdapterContext): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of externalRows(ctx)) {
    const name = normalizeName(rowName(row));
    const id = rowId(row);
    if (name && id && !map.has(name)) map.set(name, id);
  }
  return map;
}

/**
 * Atualiza somente a perna correspondente à rodada já pontuada.
 * Campos sem pontuação nova preservam o valor anterior.
 */
export function updateCopaBrasilFases(
  fases: CupFases,
  targetRound: number | null,
  scores: Map<string, number | null>,
  idByName: Map<string, string>,
  onlyPhase?: string,
): CupFases {
  const target = targetRound === null ? undefined : ROUND_TO_PHASE_LEG[targetRound];
  if (!target || (onlyPhase && onlyPhase !== target.fase)) return fases;

  const next: CupFases = { ...fases };
  const fase = fases[target.fase];
  if (!fase || !Array.isArray(fase.matches)) return fases;

  const scoreKey1 = target.leg === 'ida' ? 'scoreIda1' : 'scoreVolta1';
  const scoreKey2 = target.leg === 'ida' ? 'scoreIda2' : 'scoreVolta2';

  next[target.fase] = {
    ...fase,
    matches: fase.matches.map((match) => {
      const id1 = idByName.get(normalizeName(match.team1));
      const id2 = idByName.get(normalizeName(match.team2));
      const score1 = id1 ? toScore(scores.get(id1)) : null;
      const score2 = id2 ? toScore(scores.get(id2)) : null;
      const scoreById1 = match.team1Id ? toScore(scores.get(String(match.team1Id))) : null;
      const scoreById2 = match.team2Id ? toScore(scores.get(String(match.team2Id))) : null;
      return {
        ...match,
        ...((scoreById1 ?? score1) !== null ? { [scoreKey1]: scoreById1 ?? score1 } : {}),
        ...((scoreById2 ?? score2) !== null ? { [scoreKey2]: scoreById2 ?? score2 } : {}),
      };
    }),
  };
  return next;
}


function parseKnockoutScore(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const score = Number(String(value).replace(',', '.'));
  return Number.isFinite(score) ? score : null;
}

type CopaEntrant = { name: string; id: string; slot: number };

function phaseHasAnyScore(phase: any): boolean {
  return (phase?.matches ?? []).some((match: any) =>
    ['scoreIda1', 'scoreIda2', 'scoreVolta1', 'scoreVolta2'].some((field) =>
      match[field] !== null && match[field] !== undefined && String(match[field]).trim() !== ''
    )
  );
}

function phaseHasTeams(phase: any): boolean {
  return (phase?.matches ?? []).some((match: any) => String(match?.team1 ?? '').trim() || String(match?.team2 ?? '').trim());
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function resolveCopaMatch(match: CupMatch): { winner: string; loser: string; winnerId: string; loserId: string; winnerSlot: number; loserSlot: number } | null {
  if (!match?.team1 || !match?.team2) return null;
  if (match.manualWinner === match.team1) {
    return { winner: String(match.team1), loser: String(match.team2), winnerId: String(match.team1Id ?? ''), loserId: String(match.team2Id ?? ''), winnerSlot: Number(match.team1Slot ?? -1), loserSlot: Number(match.team2Slot ?? -1) };
  }
  if (match.manualWinner === match.team2) {
    return { winner: String(match.team2), loser: String(match.team1), winnerId: String(match.team2Id ?? ''), loserId: String(match.team1Id ?? ''), winnerSlot: Number(match.team2Slot ?? -1), loserSlot: Number(match.team1Slot ?? -1) };
  }
  const ida1 = parseKnockoutScore(match.scoreIda1);
  const ida2 = parseKnockoutScore(match.scoreIda2);
  const volta1 = parseKnockoutScore(match.scoreVolta1);
  const volta2 = parseKnockoutScore(match.scoreVolta2);
  if (ida1 === null || ida2 === null || volta1 === null || volta2 === null || ida1 + volta1 === ida2 + volta2) return null;
  const firstWins = ida1 + volta1 > ida2 + volta2;
  return firstWins
    ? { winner: String(match.team1), loser: String(match.team2), winnerId: String(match.team1Id ?? ''), loserId: String(match.team2Id ?? ''), winnerSlot: Number(match.team1Slot ?? -1), loserSlot: Number(match.team2Slot ?? -1) }
    : { winner: String(match.team2), loser: String(match.team1), winnerId: String(match.team2Id ?? ''), loserId: String(match.team1Id ?? ''), winnerSlot: Number(match.team2Slot ?? -1), loserSlot: Number(match.team1Slot ?? -1) };
}

function replaceCopaMatchTeams(match: CupMatch, team1: CopaEntrant, team2: CopaEntrant): CupMatch {
  const samePair = match.team1 === team1.name && match.team2 === team2.name;
  const next = {
    ...match,
    team1: team1.name,
    team2: team2.name,
    team1Id: team1.id,
    team2Id: team2.id,
    team1Slot: team1.slot,
    team2Slot: team2.slot,
  };
  if (!samePair) {
    for (const field of ['scoreIda1', 'scoreIda2', 'scoreVolta1', 'scoreVolta2']) next[field] = '';
    delete next.manualWinner;
  }
  return next;
}

/**
 * Inicializa os sorteios apenas quando a fase ainda está vazia e avança a chave
 * somente quando todos os confrontos da fase anterior têm vencedor definido.
 * Os IDs e os slots da planilha são salvos em cada confronto para permitir uma
 * substituição entre fases sem reescrever o histórico.
 */
export function resolveCopaBrasilProgression(
  inputFases: CupFases,
  rows: unknown[],
  teams: CartolaTeamRaw[],
): CupFases {
  let fases: CupFases = { ...inputFases };
  const byId = new Map(teams.map((team) => [String(team.id_cartola), team]));
  const entrants: CopaEntrant[] = rows.map((row, slot) => {
    const id = rowId(row);
    const team = byId.get(id);
    const name = team?.nome || rowName(row);
    return { name: String(name ?? '').trim(), id, slot };
  }).filter((team) => team.id && team.name);

  const preliminary = entrants.filter((team) => rowRole(rows[team.slot]) === 'preliminar');
  const invited = entrants.filter((team) => rowRole(rows[team.slot]) === 'convidado');

  // Pré-temporada: atualiza nomes por ID sem alterar posições e sem renomear fases
  // que já possuem qualquer placar registrado.
  for (const phaseName of Object.keys(fases)) {
    const phase = fases[phaseName];
    if (!Array.isArray(phase?.matches) || phaseHasAnyScore(phase)) continue;
    const matches = phase.matches.map((match: CupMatch) => {
      const slot1 = Number(match.team1Slot);
      const slot2 = Number(match.team2Slot);
      const team1 = Number.isInteger(slot1) ? entrants[slot1] : entrants.find((t) => normalizeName(rowName(rows[t.slot])) === normalizeName(match.team1));
      const team2 = Number.isInteger(slot2) ? entrants[slot2] : entrants.find((t) => normalizeName(rowName(rows[t.slot])) === normalizeName(match.team2));
      if (!team1 || !team2) return match;
      return { ...match, team1: team1.name, team2: team2.name, team1Id: team1.id, team2Id: team2.id, team1Slot: team1.slot, team2Slot: team2.slot };
    });
    fases = { ...fases, [phaseName]: { ...phase, matches } };
  }

  // Primeiro sorteio: 56 participantes preliminares em 28 jogos.
  const first = fases['1ª Fase'];
  if (Array.isArray(first?.matches) && first.matches.length === 28 && first.drawLocked !== true &&
      !phaseHasAnyScore(first) && preliminary.length === 56 &&
      new Set(preliminary.map((team) => team.id)).size === 56) {
    const drawn = shuffle(preliminary);
    const matches = first.matches.map((match: CupMatch, index: number) =>
      replaceCopaMatchTeams(match, drawn[index * 2], drawn[index * 2 + 1])
    );
    fases = { ...fases, '1ª Fase': { ...first, drawLocked: true, matches } };
  }

  // Segundo sorteio: 28 vencedores + quatro convidados. Só é feito uma vez,
  // quando a primeira fase está completa e a fase seguinte ainda não tem times.
  const firstMatches = fases['1ª Fase']?.matches;
  const firstWinners = Array.isArray(firstMatches) ? firstMatches.map(resolveCopaMatch) : [];
  const firstComplete = firstWinners.length === 28 && firstWinners.every(Boolean);
  const second = fases['2ª Fase'];
  if (firstComplete && Array.isArray(second?.matches) && second.matches.length === 16 &&
      second.drawLocked !== true && !phaseHasAnyScore(second) && invited.length === 4 &&
      new Set(invited.map((team) => team.id)).size === 4) {
    const qualified = firstWinners.map((result: any) => {
      const source = firstMatches.find((match: CupMatch) => match.team1 === result.winner || match.team2 === result.winner);
      const winnerId = result.winnerId || String(source?.[source?.team1 === result.winner ? 'team1Id' : 'team2Id'] ?? '');
      const winnerSlot = result.winnerSlot >= 0 ? result.winnerSlot : Number(source?.[source?.team1 === result.winner ? 'team1Slot' : 'team2Slot'] ?? -1);
      const current = winnerSlot >= 0 ? entrants[winnerSlot] : entrants.find((team) => team.id === winnerId);
      return current ?? { name: result.winner, id: winnerId, slot: winnerSlot };
    });
    const allEntrants = [...qualified, ...invited];
    if (allEntrants.every((team: CopaEntrant) => team.id && team.name) &&
        allEntrants.length === 32 && new Set(allEntrants.map((team) => team.id)).size === 32) {
      const drawn = shuffle(allEntrants);
      const matches = second.matches.map((match: CupMatch, index: number) =>
        replaceCopaMatchTeams(match, drawn[index * 2], drawn[index * 2 + 1])
      );
      fases = { ...fases, '2ª Fase': { ...second, drawLocked: true, matches } };
    }
  }

  const stageLinks = [
    { source: '2ª Fase', target: 'Oitavas de Final', sourceCount: 16, targetCount: 8 },
    { source: 'Oitavas de Final', target: 'Quartas de Final', sourceCount: 8, targetCount: 4 },
    { source: 'Quartas de Final', target: 'Semifinal', sourceCount: 4, targetCount: 2 },
  ];
  for (const link of stageLinks) {
    const sourceMatches = fases[link.source]?.matches;
    const targetPhase = fases[link.target];
    if (!Array.isArray(sourceMatches) || sourceMatches.length !== link.sourceCount ||
        !Array.isArray(targetPhase?.matches) || targetPhase.matches.length !== link.targetCount) continue;
    const winners = sourceMatches.map(resolveCopaMatch);
    if (winners.some((winner) => !winner)) continue;
    const pairs: [CopaEntrant, CopaEntrant][] = [];
    for (let i = 0; i < winners.length; i += 2) {
      const a = winners[i]!;
      const b = winners[i + 1]!;
      const aSlot = a.winnerSlot >= 0 ? a.winnerSlot : entrants.findIndex((team) => team.id === a.winnerId);
      const bSlot = b.winnerSlot >= 0 ? b.winnerSlot : entrants.findIndex((team) => team.id === b.winnerId);
      const teamA = aSlot >= 0 ? entrants[aSlot] : { name: a.winner, id: a.winnerId, slot: aSlot };
      const teamB = bSlot >= 0 ? entrants[bSlot] : { name: b.winner, id: b.winnerId, slot: bSlot };
      pairs.push([teamA, teamB]);
    }
    const matches = targetPhase.matches.map((match: CupMatch, index: number) =>
      pairs[index] ? replaceCopaMatchTeams(match, pairs[index][0], pairs[index][1]) : match
    );
    fases = { ...fases, [link.target]: { ...targetPhase, matches } };
  }

  const semifinalMatches = fases['Semifinal']?.matches;
  const finalPhase = fases['Final'];
  if (Array.isArray(semifinalMatches) && semifinalMatches.length === 2 &&
      Array.isArray(finalPhase?.matches) && finalPhase.matches.length >= 1) {
    const results = semifinalMatches.map(resolveCopaMatch);
    if (results.every(Boolean)) {
      const finalMatches = finalPhase.matches.map((match: CupMatch) => {
        const label = normalizeName(match.matchNumber);
        if (label.includes('3') || label.includes('terceirolugar')) {
          const loser1Slot = results[0]!.loserSlot >= 0 ? results[0]!.loserSlot : entrants.findIndex((team) => team.id === results[0]!.loserId);
          const loser2Slot = results[1]!.loserSlot >= 0 ? results[1]!.loserSlot : entrants.findIndex((team) => team.id === results[1]!.loserId);
          const t1 = loser1Slot >= 0 ? entrants[loser1Slot] : { name: results[0]!.loser, id: results[0]!.loserId, slot: loser1Slot };
          const t2 = loser2Slot >= 0 ? entrants[loser2Slot] : { name: results[1]!.loser, id: results[1]!.loserId, slot: loser2Slot };
          return replaceCopaMatchTeams(match, t1, t2);
        }
        const winner1Slot = results[0]!.winnerSlot >= 0 ? results[0]!.winnerSlot : entrants.findIndex((team) => team.id === results[0]!.winnerId);
        const winner2Slot = results[1]!.winnerSlot >= 0 ? results[1]!.winnerSlot : entrants.findIndex((team) => team.id === results[1]!.winnerId);
        const t1 = winner1Slot >= 0 ? entrants[winner1Slot] : { name: results[0]!.winner, id: results[0]!.winnerId, slot: winner1Slot };
        const t2 = winner2Slot >= 0 ? entrants[winner2Slot] : { name: results[1]!.winner, id: results[1]!.winnerId, slot: winner2Slot };
        return replaceCopaMatchTeams(match, t1, t2);
      });
      fases = { ...fases, Final: { ...finalPhase, matches: finalMatches } };
    }
  }

  return fases;
}

export const cartolaCopaBrasilAdapter: TournamentAdapter<CopaBrasilRaw> = {
  id: 'cartola_brasileirao_copa_brasil_v1',
  provider: KnownProviders.CARTOLA_BRASILEIRAO,
  source_type: 'api',

  async fetchRaw(ctx) {
    const fases = (ctx.previous?.fases ?? {}) as CupFases;
    const ids = extractIds(ctx);
    const teams = ids.length ? await fetchCartolaTeams(ids) : [];

    // A Sync #1 ocorre com o mercado aberto e consolida a rodada anterior.
    // Para testes/reparos manuais, scope=rodada permite apontar a rodada exata.
    let targetRound: number | null = null;
    if (ctx.scope.kind === 'rodada') {
      targetRound = ctx.scope.rodada;
    } else if (ctx.scope.kind !== 'dados_externos') {
      const market = await fetchMercadoStatus();
      targetRound = market.rodada_atual === null
        ? null
        : market.status_mercado === 1
          ? market.rodada_atual - 1
          : market.status_mercado === 2
            ? market.rodada_atual
            : null;
    }

    // scope=fase não informa ida/volta. Só atualizamos quando a rodada
    // determinada pelo mercado pertence à fase solicitada; caso contrário,
    // falhamos explicitamente em vez de retornar sucesso sem atualizar nada.
    if (ctx.scope.kind === 'fase') {
      const mappedPhase = targetRound === null ? undefined : ROUND_TO_PHASE_LEG[targetRound];
      if (!mappedPhase || mappedPhase.fase !== ctx.scope.fase) {
        throw new Error(
          `Não é possível atualizar a fase "${ctx.scope.fase}" pela rodada ${targetRound ?? 'indisponível'}. Informe scope=rodada com a rodada de ida/volta desejada.`,
        );
      }
    }

    const mapped = targetRound === null ? undefined : ROUND_TO_PHASE_LEG[targetRound];
    const idsForScores = mapped ? ids : [];
    const scores = idsForScores.length && targetRound !== null && targetRound > 0
      ? await fetchTeamsRoundScores(idsForScores, targetRound)
      : new Map<string, number | null>();

    const onlyPhase = ctx.scope.kind === 'fase' ? ctx.scope.fase : undefined;
    const updatedFases = updateCopaBrasilFases(
      fases,
      targetRound,
      scores,
      buildIdByName(ctx),
      onlyPhase,
    );

    // A progressão e os sorteios são determinísticos quanto ao momento de execução:
    // só preenchem fases vazias; após persistidos, uma nova sincronização não os refaz.
    const progressedFases = ctx.season < 2027 || ctx.scope.kind === 'dados_externos'
      ? updatedFases
      : resolveCopaBrasilProgression(updatedFases, externalRows(ctx), teams);

    return { fases: progressedFases, teams };
  },

  toFases(raw) {
    return raw.fases;
  },

  toDadosExternos(raw, ctx) {
    const byId = new Map(raw.teams.map((team) => [team.id_cartola, team]));
    const prev = externalRows(ctx);
    if (!prev.length) {
      return { rows: raw.teams.map((team) => [team.nome, team.id_cartola, team.escudo ?? '']) };
    }

    const rows = prev.map((row: any) => {
      const id = rowId(row);
      const team = byId.get(id);
      if (!Array.isArray(row)) return row;
      if (!team) return row;
      const next = [...row];
      // A atualização automática de nomes faz parte do fluxo novo (2027+).
      // A temporada atual preserva o comportamento histórico e atualiza apenas escudos.
      if (ctx.season >= 2027 && team.nome) next[0] = team.nome;
      if (id) {
        if (next.length < 2) next[1] = id;
        else next[1] = id;
      }
      if (team.escudo) next[2] = team.escudo;
      return next;
    });
    return { rows };
  },

  // A Copa do Brasil não gera classificação por pontos corridos.
  toMatches() {
    return [];
  },
};
