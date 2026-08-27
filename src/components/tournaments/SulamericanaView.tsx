import { useTournamentFinished } from '@/hooks/useTournamentFinished';
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  useDadosExternosSulamericana,
  useClassificacaoSulamericana,
  useConfrontosSulamericana,
  useConfrontosSulamericanaGrupos,
  type Confronto,
} from '@/hooks/useGoogleSheets';
import CupMatchCard from './CupMatchCard';
import MatchCard from './MatchCard';
import { canCompareContinental, buildTeamIdMap, CONTINENTAL_ALLOWED_ROUNDS } from '@/utils/matchComparison';
import { usePartialScores } from '@/hooks/usePartialScores';
import { useUserTeamIds, buildIsUserTeamById } from '@/hooks/useUserTeamIds';
import { useUserTeamNames } from '@/hooks/useUserTeamNames';

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

interface SulamericanaViewProps {
  isUserTeam?: (name: string) => boolean;
  rodadaBase?: number;
  statusMercado?: number;
  slug?: string;
  initialFase?: string;
  initialRodadaGrupos?: number;
}

const SulamericanaView = ({ isUserTeam: _isUserTeamProp, rodadaBase, statusMercado, slug, initialFase, initialRodadaGrupos }: SulamericanaViewProps) => {
  const { finished } = useTournamentFinished(slug);
  const navigate = useNavigate();
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

  const { data: dadosExternos } = useDadosExternosSulamericana();
  const { data: classificacaoData, isLoading: classLoading, error: classError } = useClassificacaoSulamericana();
  const { data: knockoutData, isLoading: knockoutLoading, error: knockoutError } = useConfrontosSulamericana(isKnockout ? fase : 'Oitavas de Final');
  const { data: groupMatchesData, isLoading: groupMatchesLoading, error: groupMatchesError } = useConfrontosSulamericanaGrupos(rodadaGrupos);

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

  // Prioridade: dado (match.league) > componente ('sulamericana') > default
  const resolvedLeague = useMemo(() => {
    return allMatches.find(m => m.league)?.league ?? 'sulamericana';
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

  const getPositionColor = (position: number, totalTeams: number) => {
    if (position >= 1 && position <= 2) return 'text-emerald-400';
    if (position === totalTeams) return 'text-red-400';
    return 'text-muted-foreground';
  };

  const renderGroupMatches = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setRodadaGrupos(r => Math.max(1, r - 1))} disabled={rodadaGrupos <= 1} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Rodada {rodadaGrupos.toString().padStart(2, '0')}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setRodadaGrupos(r => Math.min(6, r + 1))} disabled={rodadaGrupos >= 6} className="text-muted-foreground hover:text-foreground">
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {groupMatchesData?.tournament && (
        <div className="text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{groupMatchesData.tournament}</p>
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

  const renderGroupStage = () => {
    if (classLoading) return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Carregando classificação...</span>
      </div>
    );
    if (classError) return (
      <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
        <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
        <p className="text-sm text-destructive">Erro: {classError.message}</p>
      </div>
    );
    if (!classificacaoData?.groups || classificacaoData.groups.length === 0) return <p className="text-center text-sm text-muted-foreground py-8">Nenhum dado encontrado.</p>;

    const sortedGroups = [...classificacaoData.groups].sort((a, b) => a.name.localeCompare(b.name));
    const statHeaders = ['P', 'J', 'V', 'E', 'D', 'SG'];
    const parseNum = (v: string) => parseFloat((v || '0').replace(',', '.')) || 0;

    return (
      <div className="space-y-6">
        {sortedGroups.map((group, gIdx) => {
          const sortedRows = [...group.rows].sort((a, b) => {
            const pDiff = parseNum(b[3]) - parseNum(a[3]);
            if (pDiff !== 0) return pDiff;
            const vDiff = parseNum(b[5]) - parseNum(a[5]);
            if (vDiff !== 0) return vDiff;
            const sgDiff = parseNum(b[b.length - 1]) - parseNum(a[a.length - 1]);
            if (sgDiff !== 0) return sgDiff;
            const gpA = a.length >= 10 ? parseNum(a[a.length - 2]) : 0;
            const gpB = b.length >= 10 ? parseNum(b[b.length - 2]) : 0;
            return gpB - gpA;
          }).map((row, idx) => {
            const newRow = [...row];
            newRow[0] = String(idx + 1);
            return newRow;
          });

          return (
          <div key={gIdx}>
            <h3 className="text-xs font-bold text-primary mb-2 uppercase tracking-wide">{group.name}</h3>
            <div className="flex items-center px-2 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
              <div className="w-6 text-center flex-shrink-0">#</div>
              <div className="flex-1 min-w-0 pl-1 text-left">TIME</div>
              {statHeaders.map((h, i) => (
                <div key={i} className="w-7 text-center flex-shrink-0">{h}</div>
              ))}
            </div>
            {sortedRows.map((row, rowIdx) => {
              const position = parseInt(row[0], 10);
              const teamName = row[2]?.trim() || '';
              const badge = findBadge(teamName);
              const stats = [row[3], row[4], row[5], row[6], row[7], row[row.length - 1]];
              return (
                <div key={rowIdx} className={`flex items-center px-2 py-2 rounded-lg mb-1 ${isUserTeam?.(teamName) ? 'bg-red-500/25 border border-red-400/40' : 'bg-primary/15 border border-primary/20'}`}>
                  <div className={`w-6 text-center flex-shrink-0 text-[10px] font-bold ${getPositionColor(position, sortedRows.length)}`}>{row[0]}</div>
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                      {badge && <img src={badge} alt={teamName} className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                    </div>
                    <span className={`text-xs font-semibold truncate text-left ${isUserTeam?.(teamName) ? 'text-red-300 font-bold' : 'text-foreground'}`}>{teamName}</span>
                  </div>
                  {stats.map((stat, i) => (
                    <div key={i} className="w-7 text-center flex-shrink-0 text-[10px] text-muted-foreground">{stat || ''}</div>
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
    if (knockoutLoading) return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Carregando confrontos...</span>
      </div>
    );
    if (knockoutError) return (
      <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
        <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
        <p className="text-sm text-destructive">Erro: {knockoutError.message}</p>
      </div>
    );
    if (!knockoutData?.matches) return <p className="text-center text-sm text-muted-foreground py-8">Nenhum confronto encontrado.</p>;

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
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum confronto encontrado para esta fase.</p>
        )}
        {finished && knockoutData.podium && knockoutData.podium.some(p => p.team) && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              <h3 className="text-sm font-bold text-foreground">Premiação</h3>
            </div>
            {knockoutData.podium.map((entry) => {
              const isChamp = entry.position === 1;
              return (
                <div key={entry.position}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${isChamp ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-card border-border'}`}>
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                    entry.position === 1 ? 'bg-yellow-500 text-yellow-950' :
                    entry.position === 2 ? 'bg-gray-300 text-gray-800' : 'bg-amber-700 text-amber-100'
                  }`}>
                    {entry.position}º
                  </div>
                  {entry.badge && (
                    <img src={entry.badge} alt={entry.team} className={`object-contain ${isChamp ? 'w-10 h-10' : 'w-8 h-8'}`}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  )}
                  <span className={`font-semibold ${isChamp ? 'text-base text-foreground' : 'text-sm text-muted-foreground'}`}>
                    {entry.team}
                  </span>
                  {isChamp && <Trophy className="w-4 h-4 text-yellow-500 ml-auto" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
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

export default SulamericanaView;