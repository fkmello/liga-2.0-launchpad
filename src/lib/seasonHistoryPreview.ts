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
  enabled: boolean | null;
  finished: boolean | null;
  kind: 'standings' | 'knockout';
  standingsCount: number;
  podium: PreviewPodiumEntry[];
  finalMatches: Record<string, any>[];
  sourceSnapshot: Record<string, any> | null;
  alternateSources: Array<{ cacheKey: string; syncedAt: string | null }>;
  alternateSnapshots: Array<{ cacheKey: string; syncedAt: string | null; data: Record<string, any> }>;
  warnings: string[];
};

export type TournamentSettingSnapshot = { slug: string; enabled: boolean; finished: boolean };

export type SeasonHistoryPreview = {
  season: number;
  generatedAt: string;
  rankingSource: { cacheKey: string; syncedAt: string | null } | null;
  rankingSnapshot: Record<string, any> | null;
  standings: PreviewStanding[];
  tournaments: TournamentPreview[];
  warnings: string[];
};

type KnockoutFormat = {
  earlierRounds: 'two_legged' | 'single_match';
  earlierPhaseAliases: string[][];
  final: 'single_match';
  thirdPlace: 'single_match';
};

const KNOCKOUT_FORMATS: Record<string, KnockoutFormat> = {
  'copa-do-brasil': { earlierRounds: 'two_legged', earlierPhaseAliases: [['1ª Fase'], ['2ª Fase'], ['Oitavas de Final'], ['Quartas de Final'], ['Semifinal']], final: 'single_match', thirdPlace: 'single_match' },
  libertadores: { earlierRounds: 'two_legged', earlierPhaseAliases: [['Oitavas de Final'], ['Quartas de Final'], ['Semifinal']], final: 'single_match', thirdPlace: 'single_match' },
  sulamericana: { earlierRounds: 'two_legged', earlierPhaseAliases: [['Oitavas de Final'], ['Quartas de Final'], ['Semifinal']], final: 'single_match', thirdPlace: 'single_match' },
  'champions-league': { earlierRounds: 'two_legged', earlierPhaseAliases: [['Playoffs'], ['Oitavas de Final'], ['Quartas de Final'], ['Semifinal']], final: 'single_match', thirdPlace: 'single_match' },
  'copa-do-mundo': { earlierRounds: 'single_match', earlierPhaseAliases: [['16avos'], ['oitavas'], ['quartas'], ['semifinal']], final: 'single_match', thirdPlace: 'single_match' },
  'copa-intercontinental': { earlierRounds: 'single_match', earlierPhaseAliases: [['Quartas de Final'], ['Semifinal']], final: 'single_match', thirdPlace: 'single_match' },
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
  if (type.includes('terceiro') || type.includes('3 lugar') || type.includes('3º')) return 'third';
  // "semifinal" e "quartas de final" contêm a palavra "final",
  // mas não representam a decisão do campeonato.
  if (type === 'final' || type === 'grande final' || type === 'finalissima') return 'final';
  return null;
}

function resolveMatch(
  match: Record<string, any>,
  teams: Map<string, { id: string | null; badge: string | null }>,
  format: 'single_match' | 'two_legged',
) {
  const team1 = String(match.team1 ?? '').trim();
  const team2 = String(match.team2 ?? '').trim();
  if (!team1 || !team2) return null;

  const ida1 = parseCartolaNumber(match.scoreIda1 ?? match.score1);
  const ida2 = parseCartolaNumber(match.scoreIda2 ?? match.score2);
  const volta1 = parseCartolaNumber(match.scoreVolta1);
  const volta2 = parseCartolaNumber(match.scoreVolta2);
  const hasReturnLeg = match.scoreVolta1 !== undefined && match.scoreVolta2 !== undefined &&
    String(match.scoreVolta1).trim() !== '' && String(match.scoreVolta2).trim() !== '';

  // Partidas únicas usam somente o placar da própria partida. Confrontos em
  // ida e volta só podem ser resolvidos quando os dois jogos têm placar válido.
  if (ida1 === null || ida2 === null) return null;
  if (format === 'two_legged' && (!hasReturnLeg || volta1 === null || volta2 === null)) return null;

  const scoreFor = format === 'two_legged' ? ida1 + volta1! : ida1;
  const scoreAgainst = format === 'two_legged' ? ida2 + volta2! : ida2;
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

function validateEarlierRounds(data: Record<string, any>, format: KnockoutFormat): string[] {
  const phases = data?.fases ?? {};
  const warnings: string[] = [];
  const teams = externalTeamMap(data);

  for (const aliases of format.earlierPhaseAliases) {
    const phaseEntry = Object.entries(phases).find(([name]) =>
      aliases.some(alias => normalizeName(alias) === normalizeName(name)),
    );
    if (!phaseEntry) {
      warnings.push(`Fase anterior não encontrada no cache: ${aliases[0]}.`);
      continue;
    }

    const [phaseName, phaseData] = phaseEntry as [string, any];
    // Fases nulas representam etapas ainda não alimentadas, como a Intercontinental
    // antes da classificação das equipes; não são tratadas como placares inválidos.
    if (phaseData == null) continue;
    const matches = Array.isArray(phaseData?.matches) ? phaseData.matches : null;
    if (!matches) {
      warnings.push(`A fase ${phaseName} não possui uma lista de partidas reconhecível.`);
      continue;
    }
    const unresolved = matches.filter((match: Record<string, any>) =>
      !resolveMatch(match, teams, format.earlierRounds),
    ).length;
    if (unresolved) {
      warnings.push(`${phaseName}: ${unresolved} de ${matches.length} confronto(s) ainda sem resultado decisivo completo.`);
    }
  }
  return warnings;
}

function buildPodium(
  data: Record<string, any>,
  finalMatches: Record<string, any>[],
  format: KnockoutFormat,
) {
  const teams = externalTeamMap(data);
  // Não presumir que a única partida da fase seja a final: a identificação
  // precisa ser explícita para evitar transformar semifinal em campeão.
  const finalMatch = finalMatches.find(match => getMatchType(match) === 'final');
  const thirdMatch = finalMatches.find(match => getMatchType(match) === 'third');
  const finalResult = finalMatch ? resolveMatch(finalMatch, teams, format.final) : null;
  const thirdResult = thirdMatch ? resolveMatch(thirdMatch, teams, format.thirdPlace) : null;
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
  setting?: TournamentSettingSnapshot,
): TournamentPreview {
  const candidates = config.keys.map(key => snapshots.get(key)).filter(Boolean) as CacheSnapshot[];
  const selected = candidates[0] ?? null;
  const alternates = candidates.slice(1).map(row => ({ cacheKey: row.cache_key, syncedAt: row.synced_at }));
  const alternateSnapshots = candidates.slice(1).map(row => ({ cacheKey: row.cache_key, syncedAt: row.synced_at, data: row.data }));
  if (!selected) {
    const missingWarnings = ['Nenhum cache disponível para esta competição.'];
    if (setting && !setting.enabled && !setting.finished) missingWarnings.push('O torneio está desabilitado e não marcado como finalizado na configuração atual; confirmar se a edição 2026 foi efetivamente disputada antes de arquivar ou marcar como não disputada.');
    return {
      slug: config.slug, name: config.name, sourceCacheKey: null, sourceSyncedAt: null,
      sourceProvider: null, sourceFormat: null, status: 'not_found', enabled: setting?.enabled ?? null, finished: setting?.finished ?? null, kind: config.kind, standingsCount: 0, podium: [], finalMatches: [],
      sourceSnapshot: null, alternateSources: [], alternateSnapshots: [], warnings: missingWarnings,
    };
  }

  const warnings: string[] = [];
  const finalMatches = findFinalMatches(selected.data);
  const knockoutFormat = KNOCKOUT_FORMATS[config.slug];
  const result = config.kind === 'knockout' && knockoutFormat
    ? buildPodium(selected.data, finalMatches, knockoutFormat)
    : { podium: [] as PreviewPodiumEntry[], unresolved: 'Formato de mata-mata não configurado para esta competição.', thirdMissing: false, hasThirdMatch: false };
  const standingsRows = selected.data?.standings?.grupos?.geral ?? selected.data?.classificacao?.rows ?? [];
  const standingsCount = Array.isArray(standingsRows) ? standingsRows.length : 0;
  if (config.kind === 'standings') {
    warnings.push('Esta é uma fonte auxiliar de classificação da série; seu líder não será inferido automaticamente como campeão de torneio.');
  } else {
    if (result.unresolved) warnings.push(result.unresolved);
    if (result.thirdMissing) warnings.push('Terceiro colocado ainda não identificado por resultado decisivo da disputa de terceiro lugar.');
    if (knockoutFormat) warnings.push(...validateEarlierRounds(selected.data, knockoutFormat));
  }
  if (alternates.length) warnings.push('Há mais de uma fonte de cache para esta competição; as fontes alternativas foram preservadas para conferência.');
  if (setting && !setting.enabled && !setting.finished) warnings.push('O torneio está desabilitado e não marcado como finalizado na configuração atual; confirmar se a edição 2026 foi efetivamente disputada antes de arquivar ou marcar como não disputada.');
  if (setting?.finished && config.kind === 'knockout' && result.podium.length < 2) warnings.push('A configuração marca o torneio como finalizado, mas os dados disponíveis não permitem identificar o pódio completo.');
  if (!setting?.finished && selected.synced_at && Date.now() - new Date(selected.synced_at).getTime() > 7 * 24 * 60 * 60 * 1000) {
    warnings.push('Cache com mais de 7 dias: atualizar/conferir antes do arquivamento definitivo.');
  }
  return {
    slug: config.slug,
    name: config.name,
    sourceCacheKey: selected.cache_key,
    sourceSyncedAt: selected.synced_at,
    sourceProvider: selected.data?.metadata?.provider ?? null,
    sourceFormat: selected.data?.metadata?.source_type ?? selected.type ?? null,
    status: config.kind === 'standings' ? (standingsCount > 0 ? 'complete' : 'pending') : (result.podium.length === 3 && result.hasThirdMatch && !result.thirdMissing ? 'complete' : 'pending'),
    enabled: setting?.enabled ?? null,
    finished: setting?.finished ?? null,
    kind: config.kind,
    standingsCount,
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
  tournamentSettings: TournamentSettingSnapshot[] = [],
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
    tournaments: TOURNAMENT_SOURCES.map(config => tournamentPreview(config, byKey, tournamentSettings.find(setting => setting.slug === config.slug))),
    warnings,
  };
}

export const SEASON_HISTORY_CACHE_KEYS = [
  'ranking_liga:ANUAL',
  ...TOURNAMENT_SOURCES.flatMap(config => config.keys),
] as const;
