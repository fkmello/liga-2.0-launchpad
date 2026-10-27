import { useEffect, useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Trophy, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_SEASON } from '@/config/tournamentCacheKeys';
import {
  useDadosExternosLibertadores,
  useClassificacaoLibertadores,
  useConfrontosLibertadores,
  useConfrontosLibertadoresGrupos,
  type Confronto,
} from '@/hooks/useGoogleSheets';
import CupMatchCard from './CupMatchCard';
import TournamentPodium from './TournamentPodium';
import MatchCard from './MatchCard';
import { canCompareContinental, buildTeamIdMap, CONTINENTAL_ALLOWED_ROUNDS } from '@/utils/matchComparison';
import { usePartialScores } from '@/hooks/usePartialScores';
import { useUserTeamIds, buildIsUserTeamById } from '@/hooks/useUserTeamIds';
import { useUserTeamNames } from '@/hooks/useUserTeamNames';
import { resolveLibertadoresFinalResult } from '@/utils/libertadoresResults';

const FASES = [
  'Classificação',
  'Fase de Grupos',
  'Oitavas de Final',
  'Quartas de Final',
  'Semifinal',
  'Final',
];

const normalizeName = (n: string) =>
  n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const getInitialGroupRound = (base?: number) => {
  if (!base || base <= 11) return 1;
  if (base === 12) return 2;
  if (base >= 13 && base <= 14) return 3;
  if (base === 15) return 4;
  if (base >= 16 && base <= 17) return 5;
  if (base === 18) return 6;
  return 6;
};

const getInitialFase = (base?: number) => {
  if (!base || base <= 18) return 'Fase de Grupos';
  if (base >= 19 && base <= 24) return 'Oitavas de Final';
  if (base >= 25 && base <= 28) return 'Quartas de Final';
  if (base >= 29 && base <= 32) return 'Semifinal';
  if (base >= 33 && base <= 38) return 'Final';
  return 'Classificação';
};

interface LibertadoresViewProps {
  isUserTeam?: (name: string) => boolean;
  rodadaBase?: number;
  statusMercado?: number;
  slug?: string;
  initialFase?: string;
  initialRodadaGrupos?: number;
}

const LibertadoresView = ({ isUserTeam: _isUserTeamProp, rodadaBase, statusMercado, initialFase, initialRodadaGrupos }: LibertadoresViewProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [manualDecisionError, setManualDecisionError] = useState<string | null>(null);
  const [savingManualDecision, setSavingManualDecision] = useState(false);
  const userIds = useUserTeamIds();
  const { teamNames: userTeamNames } = useUserTeamNames();
  const hasInitialGroupRoundFromUrl = initialFase === 'Fase de Grupos' && initialRodadaGrupos !== undefined;

  const [fase, setFase] = useState(() => initialFase && FASES.includes(initialFase) ? initialFase : getInitialFase(rodadaBase));
  const [rodadaGrupos, setRodadaGrupos] = useState(() => hasInitialGroupRoundFromUrl ? initialRodadaGrupos! : getInitialGroupRound(rodadaBase));

  useEffect(() => {
    if (initialFase && FASES.includes(initialFase)) {
      setFase(initialFase);
    } else {
      setFase(getInitialFase(rodadaBase));
    }
  }, [rodadaBase, initialFase]);

  const isGroupMatches = fase === 'Fase de Grupos';
  const isGroupStage = fase === 'Classificação';
  const isKnockout = !isGroupMatches && !isGroupStage;
  const isFinal = fase === 'Final';

  useEffect(() => {
    if (fase !== 'Fase de Grupos' || hasInitialGroupRoundFromUrl) return;
    setRodadaGrupos(getInitialGroupRound(rodadaBase));
  }, [fase, rodadaBase, hasInitialGroupRoundFromUrl]);

  const handleFaseChange = (nextFase: string) => {
    if (!FASES.includes(nextFase)) return;
    setFase(nextFase);
    if (nextFase === 'Fase de Grupos') {
      setRodadaGrupos(hasInitialGroupRoundFromUrl ? initialRodadaGrupos! : getInitialGroupRound(rodadaBase));
    }
  };

  // Always fetch badge data
  const { data: dadosExternos } = useDadosExternosLibertadores();

  // Group stage data
  const { data: classificacaoData, isLoading: classLoading, error: classError } = useClassificacaoLibertadores();

  // Knockout data — only fetch when a knockout phase is selected
  const { data: knockoutData, isLoading: knockoutLoading, error: knockoutError } = useConfrontosLibertadores(isKnockout ? fase : 'Oitavas de Final');

  // Group matches data (RDD #01-06)
  const { data: groupMatchesData, isLoading: groupMatchesLoading, error: groupMatchesError } = useConfrontosLibertadoresGrupos(rodadaGrupos);

  const badgeUrls = useMemo(() => {
    if (!dadosExternos?.rows) return {};
    const mapping: Record<string, string> = {};
    for (const row of dadosExternos.rows) {
      const name = row[0]?.trim();
      const url = row[2]?.trim();
      if (name && url && url.startsWith('http')) {
        mapping[name] = url;
        mapping[name.toUpperCase()] = url;
        mapping[name.toLowerCase()] = url;
        mapping[normalizeName(name)] = url;
      }
    }
    return mapping;
  }, [dadosExternos]);

  const teamNameToId = useMemo(() => {
    if (!dadosExternos?.rows) return new Map<string, string>();
    return buildTeamIdMap(dadosExternos.rows);
  }, [dadosExternos]);

  const isUserTeam = useMemo(
    () => buildIsUserTeamById(teamNameToId, userIds, userTeamNames),
    [teamNameToId, userIds, userTeamNames],
  );

  const automaticPodium = useMemo(() => {
    if (!isFinal || !Array.isArray(knockoutData?.matches)) return null;
    const normalizeLabel = (value: unknown) => String(value ?? '').toUpperCase();
    const finalMatch = knockoutData.matches.find(match => normalizeLabel(match.matchNumber) === 'FINAL') as any;
    const thirdMatch = knockoutData.matches.find(match => normalizeLabel(match.matchNumber).includes('3') &&
      normalizeLabel(match.matchNumber).includes('LUGAR')) as any;
    const winnerOf = resolveLibertadoresFinalResult;
    const finalResult = winnerOf(finalMatch);
    const thirdResult = winnerOf(thirdMatch);
    if (!finalResult || !thirdResult) return null;
    const badgeFor = (team: string) => badgeUrls[team] || badgeUrls[team.toUpperCase()] || badgeUrls[normalizeName(team)] || '';
    return {
      champion: finalResult.winner,
      championBadge: badgeFor(finalResult.winner),
      runnerUp: finalResult.loser,
      runnerUpBadge: badgeFor(finalResult.loser),
      third: thirdResult.winner,
      thirdBadge: badgeFor(thirdResult.winner),
    };
  }, [isFinal, knockoutData, badgeUrls]);

  const parseKnockoutScore = (value: unknown): number | null => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const isUnresolvedKnockoutTie = (match: any, phaseName = fase) => {
    if (!match?.team1 || !match?.team2 || match.manualWinner) return false;
    const ida1 = parseKnockoutScore(match.scoreIda1);
    const ida2 = parseKnockoutScore(match.scoreIda2);
    if (ida1 === null || ida2 === null) return false;
    const volta1 = parseKnockoutScore(match.scoreVolta1);
    const volta2 = parseKnockoutScore(match.scoreVolta2);
    const singleMatch = phaseName === 'Final' && (String(match.matchNumber ?? '').toUpperCase() === 'FINAL' ||
      String(match.matchNumber ?? '').toUpperCase().includes('LUGAR'));
    if (singleMatch && volta1 === null && volta2 === null) return ida1 === ida2;
    if (volta1 === null || volta2 === null) return false;
    return ida1 + volta1 === ida2 + volta2;
  };

  const saveManualWinner = async (phaseName: string, matchNumber: string, winner: string) => {
    if (!isAdmin || !winner || savingManualDecision) return;
    setSavingManualDecision(true);
    setManualDecisionError(null);
    try {
      const cacheKey = `shadow/libertadores/${DEFAULT_SEASON}`;
      const { data: row, error: readError } = await supabase
        .from('sheets_cache')
        .select('data')
        .eq('cache_key', cacheKey)
        .maybeSingle();
      if (readError) throw readError;
      if (!row?.data) throw new Error('Não foi encontrado o cache shadow da Libertadores.');
      const payload = row.data as any;
      const matches = payload?.fases?.[phaseName]?.matches;
      if (!Array.isArray(matches)) throw new Error(`A fase ${phaseName} não foi encontrada no cache.`);
      const target = matches.find((item: any) => String(item?.matchNumber ?? '').trim().toUpperCase() === matchNumber.toUpperCase());
      if (!target || ![target.team1, target.team2].includes(winner) || !isUnresolvedKnockoutTie(target, phaseName)) {
        throw new Error('O confronto mudou ou não está mais empatado. Atualize a tela e tente novamente.');
      }
      target.manualWinner = winner;
      const { error: saveError } = await supabase
        .from('sheets_cache')
        .update({ data: payload })
        .eq('cache_key', cacheKey);
      if (saveError) throw saveError;
      await queryClient.invalidateQueries({ queryKey: ['confrontos-libertadores'] });
    } catch (error) {
      setManualDecisionError(error instanceof Error ? error.message : 'Não foi possível salvar o desempate.');
    } finally {
      setSavingManualDecision(false);
    }
  };

  // Determine the active Cartola round for partial scores
  const activeCartolaRound = useMemo(() => {
    if (!rodadaBase || !statusMercado) return undefined;
    if (isGroupMatches) {
      const allowed = CONTINENTAL_ALLOWED_ROUNDS[rodadaGrupos];
      return allowed?.includes(rodadaBase) ? rodadaBase : undefined;
    }
    if (isKnockout) {
      const allowed = CONTINENTAL_ALLOWED_ROUNDS[fase];
      return allowed?.includes(rodadaBase) ? rodadaBase : undefined;
    }
    return undefined;
  }, [isGroupMatches, isKnockout, fase, rodadaGrupos, rodadaBase, statusMercado]);

  const partialsEnabled = statusMercado === 2 && activeCartolaRound !== undefined;

  // Flatten matches for partial scores hook
  const allMatches = useMemo<Confronto[]>(() => {
    if (isGroupMatches) {
      return groupMatchesData?.groups?.flatMap(g => g.matches) ?? [];
    }
    if (isKnockout && knockoutData?.matches) {
      return knockoutData.matches.map(m => ({
        team1: m.team1,
        team2: m.team2,
        score1: m.scoreIda1,
        score2: m.scoreIda2,
        matchOrder: 0,
        league: m.league,
      }));
    }
    return [];
  }, [isGroupMatches, isKnockout, groupMatchesData, knockoutData]);

  // Prioridade: dado (match.league) > componente ('libertadores') > default
  const resolvedLeague = useMemo(() => {
    return allMatches.find(m => m.league)?.league ?? 'libertadores';
  }, [allMatches]);

  const { scores: partialScores, playedCounts } = usePartialScores(
    allMatches,
    teamNameToId,
    activeCartolaRound ?? 0,
    activeCartolaRound,
    statusMercado,
    partialsEnabled,
    resolvedLeague,
  );

  // Determine which leg is active for knockout CupMatchCards
  const activeLeg = useMemo(() => {
    if (!isKnockout || !partialsEnabled) return null;
    const allowed = CONTINENTAL_ALLOWED_ROUNDS[fase];
    if (!allowed || allowed.length < 2) return 'ida' as const;
    const idx = allowed.indexOf(rodadaBase!);
    if (idx === 0) return 'ida' as const;
    if (idx === 1) return 'volta' as const;
    return null;
  }, [isKnockout, partialsEnabled, fase, rodadaBase]);

  const handleMatchClick = (id1: string, id2: string, rodadaDoCard?: number) => {
    if (!rodadaBase || !statusMercado) return;
    const rodada = rodadaDoCard ?? (statusMercado === 1 ? rodadaBase - 1 : rodadaBase);
    if (rodada < 1) return;
    const params = new URLSearchParams({
      id1,
      id2,
      rodada: String(rodada),
      statusMercado: String(statusMercado),
      tab: 'confrontos',
      fase,
    });
    if (slug) params.set('slug', slug);
    if (fase === 'Fase de Grupos') params.set('rodadaGrupos', String(rodadaGrupos));
    navigate(`/match-comparison?${params.toString()}`);
  };

  const findBadge = (name: string) =>
    badgeUrls[name] || badgeUrls[name.toUpperCase()] || badgeUrls[name.toLowerCase()] || badgeUrls[normalizeName(name)];

  const getPositionColor = (position: number, totalTeams: number, isBestThird = false) => {
    if (position >= 1 && position <= 2) return 'text-emerald-400';
    if (position === 3 && isBestThird) return 'text-emerald-400';
    if (position === totalTeams) return 'text-red-400';
    return 'text-muted-foreground';
  };

  const renderGroupMatches = () => {
    return (
      <div className="space-y-4">
        {/* Round selector */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setRodadaGrupos(r => Math.max(1, r - 1))}
            disabled={rodadaGrupos <= 1}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Rodada {rodadaGrupos.toString().padStart(2, '0')}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setRodadaGrupos(r => Math.min(6, r + 1))}
            disabled={rodadaGrupos >= 6}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Tournament title */}
        {groupMatchesData?.tournament && (
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {groupMatchesData.tournament}
            </p>
          </div>
        )}

        {groupMatchesLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando confrontos...</span>
          </div>
        )}

        {groupMatchesError && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">Erro: {groupMatchesError.message}</p>
          </div>
        )}

        {!groupMatchesLoading && !groupMatchesError && groupMatchesData?.groups && (
          <div className="space-y-4">
            {groupMatchesData.groups.map((group, gIdx) => (
              <div key={gIdx}>
                <h3 className="text-xs font-bold text-primary mb-2 uppercase tracking-wide">{group.name}</h3>
                <div className="space-y-2">
                  {group.matches.map((match, idx) => {
                    const id1 = teamNameToId.get(match.team1?.toUpperCase());
                    const id2 = teamNameToId.get(match.team2?.toUpperCase());
                    const hasIds = !!id1 && !!id2;
                    const isEnabled = hasIds && !!rodadaBase && !!statusMercado && canCompareContinental(rodadaGrupos, rodadaBase, statusMercado);
                    return (
                      <MatchCard
                        key={`${match.team1}-${match.team2}-${idx}`}
                        match={match}
                        badgeUrls={badgeUrls}
                        isUserTeam={isUserTeam}
                        disabled={!isEnabled}
                        onMatchClick={hasIds ? () => handleMatchClick(id1!, id2!, rodadaBase) : undefined}
                        partialScore1={partialsEnabled && id1 ? partialScores.get(id1) : undefined}
                        partialScore2={partialsEnabled && id2 ? partialScores.get(id2) : undefined}
                        playedCount1={partialsEnabled && id1 ? playedCounts.get(id1) : undefined}
                        playedCount2={partialsEnabled && id2 ? playedCounts.get(id2) : undefined}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderGroupStage = () => {
    if (classLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando classificação...</span>
        </div>
      );
    }

    if (classError) {
      return (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
          <p className="text-sm text-destructive">Erro: {classError.message}</p>
        </div>
      );
    }

    if (!classificacaoData?.groups || classificacaoData.groups.length === 0) {
      return <p className="text-center text-sm text-muted-foreground py-8">Nenhum dado encontrado.</p>;
    }

    const sortedGroups = [...classificacaoData.groups].sort((a, b) => a.name.localeCompare(b.name));
    const statHeaders = ['P', 'J', 'V', 'E', 'D', 'SG'];
    const parseNum = (v: string) => parseFloat((v || '0').replace(',', '.')) || 0;

    const sortRows = (rows: string[][]) => [...rows].sort((a, b) => {
      const pDiff = parseNum(b[3]) - parseNum(a[3]);
      if (pDiff !== 0) return pDiff;
      const vDiff = parseNum(b[5]) - parseNum(a[5]);
      if (vDiff !== 0) return vDiff;
      const sgDiff = parseNum(b[b.length - 1]) - parseNum(a[a.length - 1]);
      if (sgDiff !== 0) return sgDiff;
      const gpA = a.length >= 10 ? parseNum(a[a.length - 2]) : 0;
      const gpB = b.length >= 10 ? parseNum(b[b.length - 2]) : 0;
      return gpB - gpA;
    });

    const groupsSorted = sortedGroups.map((group, gIdx) => {
      const sorted = sortRows(group.rows).map((row, idx) => {
        const newRow = [...row];
        newRow[0] = String(idx + 1);
        return newRow;
      });
      return { gIdx, name: group.name, rows: sorted };
    });

    // Compute 2 best thirds across all groups
    const thirds = groupsSorted
      .map(g => ({ gIdx: g.gIdx, row: g.rows[2] }))
      .filter(t => !!t.row);
    thirds.sort((a, b) => {
      const pDiff = parseNum(b.row[3]) - parseNum(a.row[3]);
      if (pDiff !== 0) return pDiff;
      const vDiff = parseNum(b.row[5]) - parseNum(a.row[5]);
      if (vDiff !== 0) return vDiff;
      const sgDiff = parseNum(b.row[b.row.length - 1]) - parseNum(a.row[a.row.length - 1]);
      if (sgDiff !== 0) return sgDiff;
      const gpA = a.row.length >= 10 ? parseNum(a.row[a.row.length - 2]) : 0;
      const gpB = b.row.length >= 10 ? parseNum(b.row[b.row.length - 2]) : 0;
      return gpB - gpA;
    });
    const bestThirdsSet = new Set(thirds.slice(0, 2).map(t => `${t.gIdx}:${(t.row[2] || '').trim()}`));

    return (
      <div className="space-y-6">
        {groupsSorted.map(({ gIdx, name, rows: sortedRows }) => {
          return (
          <div key={gIdx}>
            <h3 className="text-xs font-bold text-primary mb-2 uppercase tracking-wide">{name}</h3>

            {/* Header row */}
            <div className="flex items-center px-2 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
              <div className="w-6 text-center flex-shrink-0">#</div>
              <div className="flex-1 min-w-0 pl-1 text-left">TIME</div>
              {statHeaders.map((h, i) => (
                <div key={i} className="w-7 text-center flex-shrink-0">{h}</div>
              ))}
            </div>

            {/* Team rows */}
            {sortedRows.map((row, rowIdx) => {
              const position = parseInt(row[0], 10);
              const teamName = row[2]?.trim() || '';
              const badge = findBadge(teamName);
              const stats = [row[3], row[4], row[5], row[6], row[7], row[row.length - 1]];
              const isBestThird = bestThirdsSet.has(`${gIdx}:${teamName}`);

              return (
                <div key={rowIdx} className={`flex items-center px-2 py-2 rounded-lg mb-1 ${isUserTeam?.(teamName) ? 'bg-red-500/25 border border-red-400/40' : 'bg-primary/15 border border-primary/20'}`}>
                  <div className={`w-6 text-center flex-shrink-0 text-[10px] font-bold ${getPositionColor(position, sortedRows.length, isBestThird)}`}>
                    {row[0]}
                  </div>

                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                      {badge && (
                        <img src={badge} alt={teamName} className="w-5 h-5 object-contain"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      )}
                    </div>
                    <span className={`text-xs font-semibold truncate text-left ${isUserTeam?.(teamName) ? 'text-red-300 font-bold' : 'text-foreground'}`}>{teamName}</span>
                  </div>
                  {stats.map((stat, i) => (
                    <div key={i} className="w-7 text-center flex-shrink-0 text-[10px] text-muted-foreground">
                      {stat || ''}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          );
        })}
      </div>
    );
  };

  const renderKnockout = () => {
    if (knockoutLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando confrontos...</span>
        </div>
      );
    }

    if (knockoutError) {
      return (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
          <p className="text-sm text-destructive">Erro: {knockoutError.message}</p>
        </div>
      );
    }

    if (!knockoutData?.matches) {
      return <p className="text-center text-sm text-muted-foreground py-8">Nenhum confronto encontrado.</p>;
    }

    return (
      <div className="space-y-2">
        {knockoutData.rodadaInfo && (
          <div className="text-center mb-2">
            <p className="text-xs text-muted-foreground">{knockoutData.rodadaInfo}</p>
          </div>
        )}

        {knockoutData.matches.length > 0 ? (
          knockoutData.matches.map((match, idx) => {
            const id1 = teamNameToId.get(match.team1?.toUpperCase());
            const id2 = teamNameToId.get(match.team2?.toUpperCase());
            const hasIds = !!id1 && !!id2;
            const isEnabled = hasIds && !!rodadaBase && !!statusMercado && canCompareContinental(fase, rodadaBase, statusMercado);
            return (
              <CupMatchCard key={`${match.matchNumber}-${idx}`} match={match} badgeUrls={badgeUrls} isFinal={isFinal} isUserTeam={isUserTeam}
                disabled={!isEnabled}
                onMatchClick={hasIds ? () => handleMatchClick(id1!, id2!) : undefined}
                activeLeg={activeLeg}
                partialScore1={partialsEnabled && id1 ? partialScores.get(id1) : undefined}
                partialScore2={partialsEnabled && id2 ? partialScores.get(id2) : undefined}
                playedCount1={partialsEnabled && id1 ? playedCounts.get(id1) : undefined}
                playedCount2={partialsEnabled && id2 ? playedCounts.get(id2) : undefined}
              />
            );
          })
        ) : (
          <p className="text-center text-sm text-muted-foreground py-8">
            Nenhum confronto encontrado para esta fase.
          </p>
        )}

        {isAdmin && isKnockout && knockoutData.matches.some((match: any) => isUnresolvedKnockoutTie(match, fase)) && (
          <div className="mt-4 space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-sm font-semibold text-amber-200">Desempate manual necessário</p>
            <p className="text-xs text-muted-foreground">Há confronto empatado no agregado. Selecione o vencedor do sorteio; a escolha ficará salva no cache da Libertadores e será preservada pela sincronização.</p>
            {knockoutData.matches.filter((match: any) => isUnresolvedKnockoutTie(match, fase)).map((match: any) => (
              <div key={String(match.matchNumber)} className="space-y-2 rounded-md border border-border p-3">
                <p className="text-xs font-semibold">{String(match.matchNumber ?? 'Confronto')} — {match.team1} x {match.team2}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={savingManualDecision} onClick={() => saveManualWinner(fase, String(match.matchNumber ?? ''), String(match.team1))}>
                    Vencedor: {match.team1}
                  </Button>
                  <Button size="sm" variant="outline" disabled={savingManualDecision} onClick={() => saveManualWinner(fase, String(match.matchNumber ?? ''), String(match.team2))}>
                    Vencedor: {match.team2}
                  </Button>
                </div>
              </div>
            ))}
            {manualDecisionError && <p className="text-xs text-destructive">{manualDecisionError}</p>}
          </div>
        )}

        {/* Libertadores podium appears automatically when final and third-place results are complete. */}
        {automaticPodium && (
          <div className="mt-6">
            <TournamentPodium
              title="Premiação da Libertadores"
              champion={automaticPodium.champion}
              championBadge={automaticPodium.championBadge}
              runnerUp={automaticPodium.runnerUp}
              runnerUpBadge={automaticPodium.runnerUpBadge}
              third={automaticPodium.third}
              thirdBadge={automaticPodium.thirdBadge}
              isUserTeam={isUserTeam}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Phase selector */}
      <div className="flex items-center gap-3">
        <Trophy className="w-4 h-4 text-primary flex-shrink-0" />
        <Select value={fase} onValueChange={handleFaseChange}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Selecione a fase" />
          </SelectTrigger>
          <SelectContent>
            {FASES.map(f => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isGroupMatches ? renderGroupMatches() : isGroupStage ? renderGroupStage() : renderKnockout()}
    </div>
  );
};

export default LibertadoresView;
