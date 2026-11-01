export type CacheSnapshot = {
  cache_key: string;
  type: string | null;
  synced_at: string | null;
  data: Record<string, any>;
};

export type PreviewStanding = {
  position: number;
  teamName: string;
  cartolaTeamId: string | null;
  badgeUrl: string | null;
  totalPoints: number | null;
  sourceSnapshot: Record<string, any>;
};

export type PreviewPodiumEntry = {
  position: 1 | 2 | 3;
  teamName: string;
  badgeUrl: string | null;
  scoreFor: number | null;
  scoreAgainst: number | null;
  decidedManually: boolean;
};

export type TournamentPreview = {
  slug: string;
  name: string;
  sourceCacheKey: string | null;
  sourceSyncedAt: string | null;
  sourceProvider: string | null;
  sourceFormat: string | null;
  status: 'complete' | 'pending' | 'not_found';
  podium: PreviewPodiumEntry[];
  finalMatches: Record<string, any>[];
  sourceSnapshot: Record<string, any> | null;
  alternateSources: Array<{ cacheKey: string; syncedAt: string | null }>;
  alternateSnapshots: Array<{ cacheKey: string; syncedAt: string | null; data: Record<string, any> }>;
  warnings: string[];
};

export type SeasonHistoryPreview = {
  season: number;
  generatedAt: string;
  rankingSource: { cacheKey: string; syncedAt: string | null } | null;
  rankingSnapshot: Record<string, any> | null;
  standings: PreviewStanding[];
  tournaments: TournamentPreview[];
  warnings: string[];
};

const TOURNAMENT_SOURCES = [
  { slug: 'brasileirao-serie-a', name: 'Brasileirão Série A', keys: ['shadow/brasileirao_serie_a/2026'], kind: 'standings' },
  { slug: 'brasileirao-serie-b', name: 'Brasileirão Série B', keys: ['shadow/brasileirao_serie_b/2026'], kind: 'standings' },
  { slug: 'brasileirao-serie-c', name: 'Brasileirão Série C', keys: ['shadow/brasileirao_serie_c/2026'], kind: 'standings' },
  { slug: 'copa-do-brasil', name: 'Copa do Brasil', keys: ['shadow/copa_brasil/2026', 'copa:brasil'], kind: 'knockout' },
  { slug: 'libertadores', name: 'Libertadores', keys: ['shadow/libertadores/2026', 'libertadores'], kind: 'knockout' },
  { slug: 'sulamericana', name: 'Sul-Americana', keys: ['sulamericana:2026', 'sulamericana'], kind: 'knockout' },
  { slug: 'champions-league', name: 'Champions League', keys: ['campeoes'], kind: 'knockout' },
  { slug: 'copa-do-mundo', name: 'Copa do Mundo', keys: ['copa_mundo'], kind: 'knockout' },
  { slug: 'copa-intercontinental', name: 'Copa Intercontinental', keys: ['intercontinental'], kind: 'knockout' },
] as const;

function normalizeName(value: unknown): string {
  return String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export function parseCartolaNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function externalTeamMap(data: Record<string, any>): Map<string, { id: string | null; badge: string | null }> {
  const rows = data?.dados_externos?.rows ?? data?.externalRows ?? data?.dados_externos?.raw ?? [];
  const map = new Map<string, { id: string | null; badge: string | null }>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const name = normalizeName(row[0]);
    if (!name || name === 'equipe cartola fc') continue;
    const id = row[1] == null ? null : String(row[1]);
    const badgeCandidate = row.length >= 4 ? row[3] : row[2];
    const badge = typeof badgeCandidate === 'string' && /^https?:\/\//i.test(badgeCandidate) ? badgeCandidate : null;
    if (!map.has(name)) map.set(name, { id, badge });
  }
  return map;
}

function findFinalMatches(data: Record<string, any>): Record<string, any>[] {
  const phases = data?.fases ?? {};
  const finalPhase = Object.entries(phases).find(([name]) => normalizeName(name) === 'final')?.[1] as any;
  return Array.isArray(finalPhase?.matches) ? finalPhase.matches : [];
}

function getMatchType(match: Record<string, any>): 'final' | 'third' | null {
  const type = normalizeName(match.tipo ?? match.matchNumber ?? match.match_number ?? '');
  if (type === 'final' || type.includes('final') && !type.includes('terceiro')) return 'final';
  if (type.includes('terceiro') || type.includes('3 lugar') || type.includes('3º')) return 'third';
  return null;
}

function resolveMatch(match: Record<string, any>, teams: Map<string, { id: string | null; badge: string | null }>) {
  const team1 = String(match.team1 ?? '').trim();
  const team2 = String(match.team2 ?? '').trim();
  if (!team1 || !team2) return null;

  const ida1 = parseCartolaNumber(match.scoreIda1 ?? match.score1);
  const ida2 = parseCartolaNumber(match.scoreIda2 ?? match.score2);
  const volta1 = parseCartolaNumber(match.scoreVolta1);
  const volta2 = parseCartolaNumber(match.scoreVolta2);
  const hasReturnLeg = match.scoreVolta1 !== undefined && match.scoreVolta2 !== undefined &&
    String(match.scoreVolta1).trim() !== '' && String(match.scoreVolta2).trim() !== '';
  if (ida1 === null || ida2 === null || (hasReturnLeg && (volta1 === null || volta2 === null))) return null;

  const scoreFor = ida1 + (hasReturnLeg ? volta1! : 0);
  const scoreAgainst = ida2 + (hasReturnLeg ? volta2! : 0);
  const manualWinner = String(match.manualWinner ?? '').trim();
  let winner: string | null = null;
  let loser: string | null = null;
  let decidedManually = false;

  if (manualWinner) {
    if (normalizeName(manualWinner) !== normalizeName(team1) && normalizeName(manualWinner) !== normalizeName(team2)) return null;
    winner = manualWinner;
    loser = normalizeName(winner) === normalizeName(team1) ? team2 : team1;
    decidedManually = true;
  } else if (scoreFor !== scoreAgainst) {
    winner = scoreFor > scoreAgainst ? team1 : team2;
    loser = winner === team1 ? team2 : team1;
  } else {
    return null;
  }

  const winnerScore = winner === team1 ? scoreFor : scoreAgainst;
  const loserScore = winner === team1 ? scoreAgainst : scoreFor;
  const badgeFor = (name: string) => teams.get(normalizeName(name))?.badge ?? null;
  return {
    winner: { teamName: winner, badgeUrl: badgeFor(winner), scoreFor: winnerScore, scoreAgainst: loserScore, decidedManually },
    loser: { teamName: loser, badgeUrl: badgeFor(loser), scoreFor: loserScore, scoreAgainst: winnerScore, decidedManually },
  };
}

function buildPodium(data: Record<string, any>, finalMatches: Record<string, any>[]) {
  const teams = externalTeamMap(data);
  const finalMatch = finalMatches.find(match => getMatchType(match) === 'final') ?? (finalMatches.length === 1 ? finalMatches[0] : null);
  const thirdMatch = finalMatches.find(match => getMatchType(match) === 'third');
  const finalResult = finalMatch ? resolveMatch(finalMatch, teams) : null;
  const thirdResult = thirdMatch ? resolveMatch(thirdMatch, teams) : null;
  const podium: PreviewPodiumEntry[] = [];
  if (finalResult) {
    podium.push({ position: 1, ...finalResult.winner });
    podium.push({ position: 2, ...finalResult.loser });
  }
  if (thirdResult) podium.push({ position: 3, ...thirdResult.winner });
  return { podium, unresolved: (!finalResult ? 'A final não possui resultado decisivo completo.' : null), thirdMissing: Boolean(thirdMatch) && !thirdResult, hasThirdMatch: Boolean(thirdMatch) };
}

function tournamentPreview(
  config: typeof TOURNAMENT_SOURCES[number],
  snapshots: Map<string, CacheSnapshot>,
): TournamentPreview {
  const candidates = config.keys.map(key => snapshots.get(key)).filter(Boolean) as CacheSnapshot[];
  const selected = candidates[0] ?? null;
  const alternates = candidates.slice(1).map(row => ({ cacheKey: row.cache_key, syncedAt: row.synced_at }));
  const alternateSnapshots = candidates.slice(1).map(row => ({ cacheKey: row.cache_key, syncedAt: row.synced_at, data: row.data }));
  if (!selected) {
    return {
      slug: config.slug, name: config.name, sourceCacheKey: null, sourceSyncedAt: null,
      sourceProvider: null, sourceFormat: null, status: 'not_found', podium: [], finalMatches: [],
      sourceSnapshot: null, alternateSources: [], alternateSnapshots: [], warnings: ['Nenhum cache disponível para esta competição.'],
    };
  }

  const warnings: string[] = [];
  const finalMatches = findFinalMatches(selected.data);
  const result = buildPodium(selected.data, finalMatches);
  if (config.kind === 'standings') {
    warnings.push('Fonte de classificação da série identificada. O campeão desta série não será inferido como campeão de torneio.');
  } else {
    if (result.unresolved) warnings.push(result.unresolved);
    if (result.thirdMissing) warnings.push('Terceiro colocado ainda não identificado por resultado decisivo da disputa de terceiro lugar.');
  }
  if (alternates.length) warnings.push('Há mais de uma fonte de cache para esta competição; as fontes alternativas foram preservadas para conferência.');
  if (selected.synced_at && Date.now() - new Date(selected.synced_at).getTime() > 7 * 24 * 60 * 60 * 1000) {
    warnings.push('Cache com mais de 7 dias: atualizar/conferir antes do arquivamento definitivo.');
  }
  return {
    slug: config.slug,
    name: config.name,
    sourceCacheKey: selected.cache_key,
    sourceSyncedAt: selected.synced_at,
    sourceProvider: selected.data?.metadata?.provider ?? null,
    sourceFormat: selected.data?.metadata?.source_type ?? selected.type ?? null,
    status: result.podium.length >= 2 ? 'complete' : 'pending',
    podium: result.podium,
    finalMatches,
    sourceSnapshot: selected.data,
    alternateSources: alternates,
    alternateSnapshots,
    warnings,
  };
}

export function buildSeasonHistoryPreview(
  season: number,
  snapshots: CacheSnapshot[],
): SeasonHistoryPreview {
  const byKey = new Map(snapshots.map(row => [row.cache_key, row]));
  const ranking = byKey.get('ranking_liga:ANUAL');
  const rankingRows = Array.isArray(ranking?.data?.rankings) ? ranking.data.rankings : [];
  const externalIds = new Map<string, string>();
  const conflictingNames = new Set<string>();
  for (const snapshot of snapshots) {
    for (const [name, team] of externalTeamMap(snapshot.data)) {
      if (!team.id) continue;
      const existing = externalIds.get(name);
      if (existing && existing !== team.id) conflictingNames.add(name);
      else externalIds.set(name, team.id);
    }
  }
  const standings = rankingRows.map((row: any, index: number) => {
    const normalizedTeamName = normalizeName(row.teamName);
    return {
    position: Number(row.position) || index + 1,
    teamName: String(row.teamName ?? '').trim(),
    cartolaTeamId: conflictingNames.has(normalizedTeamName) ? null : externalIds.get(normalizedTeamName) ?? null,
    badgeUrl: typeof row.badge === 'string' && row.badge ? row.badge : null,
    totalPoints: parseCartolaNumber(row.total),
    sourceSnapshot: row,
  }; }).filter((row: PreviewStanding) => row.teamName).sort((a: PreviewStanding, b: PreviewStanding) => a.position - b.position);

  const warnings: string[] = [];
  if (!ranking) warnings.push('Cache ranking_liga:ANUAL não encontrado.');
  if (conflictingNames.size) warnings.push(`Há ${conflictingNames.size} nome(s) de equipe associado(s) a mais de um ID Cartola entre os caches; a identificação foi deixada em branco para conferência manual.`);
  const withoutCartolaId = standings.filter(row => !row.cartolaTeamId).length;
  if (ranking && withoutCartolaId) warnings.push(`${withoutCartolaId} equipe(s) do ranking anual ainda não puderam ser vinculadas com segurança a um ID Cartola.`);
  if (ranking && standings.length !== 60) warnings.push(`A classificação anual contém ${standings.length} equipes; a quantidade observada atualmente é 60, mas o total pode variar entre temporadas.`);
  if (ranking?.synced_at && Date.now() - new Date(ranking.synced_at).getTime() > 24 * 60 * 60 * 1000) {
    warnings.push('O ranking anual não é atualizado há mais de 24 horas.');
  }
  warnings.push('Esta é uma prévia de captura. Não representa confirmação de encerramento da temporada nem autoriza arquivamento.');

  return {
    season,
    generatedAt: new Date().toISOString(),
    rankingSource: ranking ? { cacheKey: ranking.cache_key, syncedAt: ranking.synced_at } : null,
    rankingSnapshot: ranking?.data ?? null,
    standings,
    tournaments: TOURNAMENT_SOURCES.map(config => tournamentPreview(config, byKey)),
    warnings,
  };
}

export const SEASON_HISTORY_CACHE_KEYS = [
  'ranking_liga:ANUAL',
  ...TOURNAMENT_SOURCES.flatMap(config => config.keys),
] as const;
