import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  useDadosExternosCampeoes,
  useClassificacaoCampeoes,
  useConfrontosCampeoesFaseLiga,
  useConfrontosCampeoes,
  type Confronto,
} from '@/hooks/useGoogleSheets';
import MatchCard from './MatchCard';
import CupMatchCard from './CupMatchCard';
import { canCompareChampions, buildTeamIdMap } from '@/utils/matchComparison';
import { usePartialScores } from '@/hooks/usePartialScores';
import { buildCartolaUrl } from '@/config/cartolaEndpoint';
import { useUserTeamIds, buildIsUserTeamById } from '@/hooks/useUserTeamIds';
import { useUserTeamNames } from '@/hooks/useUserTeamNames';
import { useTournamentFinished } from '@/hooks/useTournamentFinished';

const CHAMPIONS_KNOCKOUT_ROUNDS: Record<string, { ida: number; volta?: number }> = {
  'Semifinal': { ida: 15, volta: 16 },
  'Final': { ida: 17 },
};

const FASES = [
  'Classificação',
  'Fase de Liga',
  'Playoffs',
  'Oitavas de Final',
  'Quartas de Final',
  'Semifinal',
  'Final',
];

const KNOCKOUT_FASES = ['Playoffs', 'Oitavas de Final', 'Quartas de Final', 'Semifinal', 'Final'];

const normalizeName = (n: string) =>
  n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

interface Props {
  isUserTeam?: (name: string) => boolean;
  rodadaBase?: number;
  statusMercado?: number;
  slug?: string;
  initialFase?: string;
  initialRodadaLiga?: number;
}

interface PodiumSlotProps {
  place: 1 | 2 | 3;
  name?: string;
  badge?: string;
  heightClass: string;
  bgClass: string;
  labelColor: string;
  isUser?: boolean;
  big?: boolean;
}

const PodiumSlot = ({ place, name, badge, heightClass, bgClass, labelColor, isUser, big }: PodiumSlotProps) => {
  const badgeSize = big ? 'w-16 h-16' : 'w-12 h-12';
  const placeLabel = place === 1 ? 'Campeão' : place === 2 ? 'Vice' : '3º Lugar';
  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0 max-w-[33%]">
      <div className={`relative ${badgeSize} flex items-center justify-center rounded-full bg-card border-2 ${isUser ? 'border-red-400 ring-2 ring-red-400/40' : 'border-border'}`}>
        {badge ? (
          <img src={badge} alt={name ?? ''} className={`${big ? 'w-12 h-12' : 'w-9 h-9'} object-contain`} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ) : (
          <Trophy className="w-5 h-5 text-muted-foreground" />
        )}
        <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full bg-card border border-border text-[10px] font-bold flex items-center justify-center ${labelColor}`}>
          {place}
        </div>
      </div>
      <span className={`text-[11px] font-semibold text-center leading-tight truncate w-full ${isUser ? 'text-red-300' : 'text-foreground'}`}>
        {name ?? '—'}
      </span>
      <div className={`w-full ${heightClass} ${bgClass} border-t-2 rounded-t-sm flex items-start justify-center pt-1`}>
        <span className={`text-[9px] font-bold uppercase tracking-wider ${labelColor}`}>{placeLabel}</span>
      </div>
    </div>
  );
};



const ChampionsLeagueView = ({
  isUserTeam: _isUserTeamProp,
  rodadaBase,
  statusMercado,
  slug,
  initialFase,
  initialRodadaLiga,
}: Props) => {
  const userIds = useUserTeamIds();
  const { teamNames: userTeamNames } = useUserTeamNames();
  const navigate = useNavigate();
  const { finished } = useTournamentFinished(slug);
  const [fase, setFase] = useState(initialFase && FASES.includes(initialFase) ? initialFase : FASES[0]);
  const [rodadaLiga, setRodadaLiga] = useState<number>(initialRodadaLiga ?? 1);

  const isLeaguePhase = fase === 'Fase de Liga';
  const isClassificacao = fase === 'Classificação';
  const isKnockout = KNOCKOUT_FASES.includes(fase);
  const isFinal = fase === 'Final';

  const { data: dadosExternos } = useDadosExternosCampeoes();
  const { data: classData, isLoading: classLoading, error: classError } = useClassificacaoCampeoes();
  const { data: faseLigaData, isLoading: ligaLoading, error: ligaError } =
    useConfrontosCampeoesFaseLiga(isLeaguePhase ? rodadaLiga : 0);
  const { data: knockoutData, isLoading: knockoutLoading, error: knockoutError } =
    useConfrontosCampeoes(isKnockout ? fase : 'Playoffs');

  const badgeUrls = useMemo(() => {
    if (!dadosExternos?.rows) return {} as Record<string, string>;
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

  // Partial scores apenas na fase de liga, na rodada atual com mercado fechado
  const partialsEnabled =
    isLeaguePhase && statusMercado === 2 && rodadaBase !== undefined && rodadaBase === rodadaLiga;

  const allMatches = useMemo<Confronto[]>(() => {
    if (isLeaguePhase) return faseLigaData?.matches ?? [];
    return [];
  }, [isLeaguePhase, faseLigaData]);

  const resolvedLeague = useMemo(
    () => allMatches.find(m => m.league)?.league ?? 'campeoes',
    [allMatches],
  );

  const { scores: partialScores, playedCounts } = usePartialScores(
    allMatches,
    teamNameToId,
    rodadaBase ?? 0,
    partialsEnabled ? rodadaBase : undefined,
    statusMercado,
    partialsEnabled,
    resolvedLeague,
  );

  const findBadge = (name: string) =>
    badgeUrls[name] ||
    badgeUrls[name.toUpperCase()] ||
    badgeUrls[name.toLowerCase()] ||
    badgeUrls[normalizeName(name)];

  const handleMatchClick = (id1: string, id2: string, rodadaDoCard?: number) => {
    if (!rodadaBase || !statusMercado) return;
    const rodada = rodadaDoCard ?? rodadaBase;
    const params = new URLSearchParams({
      id1,
      id2,
      rodada: String(rodada),
      statusMercado: String(statusMercado),
      tab: 'confrontos',
      fase,
      league: 'campeoes',
    });
    if (slug) params.set('slug', slug);
    if (isLeaguePhase) params.set('rodadaLiga', String(rodadaLiga));
    navigate(`/match-comparison?${params.toString()}`);
  };

  const getPositionColor = (position: number, total: number) => {
    if (position >= 1 && position <= 8) return 'text-emerald-400';
    if (position >= total - 3) return 'text-red-400';
    return 'text-muted-foreground';
  };

  const renderClassificacao = () => {
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
    const rows = classData?.rows ?? [];
    if (rows.length === 0) {
      return <p className="text-center text-sm text-muted-foreground py-8">Nenhum dado encontrado.</p>;
    }
    const statHeaders = ['P', 'J', 'V', 'E', 'D', 'SG'];
    return (
      <div className="space-y-1">
        <div className="flex items-center px-2 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
          <div className="w-6 text-center flex-shrink-0">#</div>
          <div className="flex-1 min-w-0 pl-1 text-left">TIME</div>
          {statHeaders.map((h, i) => (
            <div key={i} className="w-7 text-center flex-shrink-0">{h}</div>
          ))}
        </div>
        {rows.map((row, idx) => {
          const position = parseInt(row.position, 10) || idx + 1;
          const teamName = row.name;
          const badge = row.badge || findBadge(teamName);
          const stats = [row.points, row.games, row.wins, row.draws, row.losses, row.sg];
          return (
            <div
              key={idx}
              className={`flex items-center px-2 py-2 rounded-lg ${
                isUserTeam?.(teamName)
                  ? 'bg-red-500/25 border border-red-400/40'
                  : 'bg-primary/15 border border-primary/20'
              }`}
            >
              <div className={`w-6 text-center flex-shrink-0 text-[10px] font-bold ${getPositionColor(position, rows.length)}`}>
                {row.position}
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                  {badge && (
                    <img
                      src={badge}
                      alt={teamName}
                      className="w-5 h-5 object-contain"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                </div>
                <span className={`text-xs font-semibold truncate text-left ${
                  isUserTeam?.(teamName) ? 'text-red-300 font-bold' : 'text-foreground'
                }`}>
                  {teamName}
                </span>
              </div>
              {stats.map((s, i) => (
                <div key={i} className="w-7 text-center flex-shrink-0 text-[10px] text-muted-foreground">
                  {s || ''}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  };

  const renderFaseLiga = () => {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setRodadaLiga(r => Math.max(1, r - 1))}
            disabled={rodadaLiga <= 1}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Rodada {rodadaLiga.toString().padStart(2, '0')}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setRodadaLiga(r => Math.min(8, r + 1))}
            disabled={rodadaLiga >= 8}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {ligaLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando confrontos...</span>
          </div>
        )}
        {ligaError && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">Erro: {ligaError.message}</p>
          </div>
        )}
        {!ligaLoading && !ligaError && (faseLigaData?.matches?.length ?? 0) === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum confronto encontrado.</p>
        )}
        {!ligaLoading && !ligaError && (faseLigaData?.matches?.length ?? 0) > 0 && (
          <div className="space-y-2">
            {faseLigaData!.matches.map((match, idx) => {
              const id1 = teamNameToId.get(match.team1?.toUpperCase());
              const id2 = teamNameToId.get(match.team2?.toUpperCase());
              const hasIds = !!id1 && !!id2;
              const matchWithRound = { ...match, rodada: rodadaLiga };
              const isEnabled =
                hasIds &&
                rodadaBase !== undefined &&
                statusMercado !== undefined &&
                canCompareChampions(matchWithRound, rodadaBase, statusMercado);
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
        )}
      </div>
    );
  };

  // Partial scores no mata-mata: rodada atual + mercado fechado + fase mapeada
  const activeLeg = useMemo<'ida' | 'volta' | null>(() => {
    if (!isKnockout || statusMercado !== 2 || !rodadaBase) return null;
    const cfg = CHAMPIONS_KNOCKOUT_ROUNDS[fase];
    if (!cfg) return null;
    if (rodadaBase === cfg.ida) return 'ida';
    if (cfg.volta && rodadaBase === cfg.volta) return 'volta';
    return null;
  }, [isKnockout, statusMercado, rodadaBase, fase]);

  const knockoutPartialIds = useMemo(() => {
    if (!activeLeg || !knockoutData?.matches) return '';
    const seen = new Set<string>();
    for (const m of knockoutData.matches) {
      const id1 = teamNameToId.get(m.team1?.toUpperCase());
      const id2 = teamNameToId.get(m.team2?.toUpperCase());
      if (id1) seen.add(id1);
      if (id2) seen.add(id2);
    }
    return Array.from(seen).sort().join(',');
  }, [activeLeg, knockoutData?.matches, teamNameToId]);

  const { data: koPartialData } = useQuery({
    queryKey: ['champions-ko-partials', fase, rodadaBase, knockoutPartialIds],
    queryFn: async () => {
      const url = buildCartolaUrl(
        { action: 'batch_lineups', ids: knockoutPartialIds, rodada: rodadaBase },
        'campeoes',
      );
      const res = await fetch(url, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error(`batch_lineups failed: ${res.status}`);
      return await res.json() as {
        scores: Record<string, number | null>;
        playedCounts: Record<string, number>;
      };
    },
    enabled: !!activeLeg && knockoutPartialIds.length > 0,
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  const koPartials = useMemo(() => {
    const scores = new Map<string, number>();
    const played = new Map<string, number>();
    if (koPartialData) {
      for (const [id, s] of Object.entries(koPartialData.scores)) {
        if (s !== null && s !== undefined) scores.set(id, s);
      }
      for (const [id, c] of Object.entries(koPartialData.playedCounts)) {
        played.set(id, c);
      }
    }
    return { scores, played };
  }, [koPartialData]);

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
    const matches = knockoutData?.matches ?? [];
    if (matches.length === 0) {
      return <p className="text-center text-sm text-muted-foreground py-8">Nenhum confronto encontrado para esta fase.</p>;
    }
    // Pódio: calcular Campeão, Vice e 3º a partir dos confrontos da Final
    let podium: { champion?: string; runnerUp?: string; third?: string } = {};
    if (isFinal) {
      const parse = (s?: string) => {
        const n = parseFloat((s ?? '').replace(',', '.'));
        return isNaN(n) ? 0 : n;
      };
      const finalMatch =
        matches.find(m => /final/i.test(m.matchNumber ?? '') && !/3/.test(m.matchNumber ?? '')) ??
        matches[0];
      const thirdMatch =
        matches.find(m => /3/.test(m.matchNumber ?? '') || /lugar/i.test(m.matchNumber ?? '')) ??
        matches[1];
      if (finalMatch) {
        const s1 = parse(finalMatch.scoreIda1);
        const s2 = parse(finalMatch.scoreIda2);
        if (s1 >= s2) {
          podium.champion = finalMatch.team1;
          podium.runnerUp = finalMatch.team2;
        } else {
          podium.champion = finalMatch.team2;
          podium.runnerUp = finalMatch.team1;
        }
      }
      if (thirdMatch) {
        const s1 = parse(thirdMatch.scoreIda1);
        const s2 = parse(thirdMatch.scoreIda2);
        podium.third = s1 >= s2 ? thirdMatch.team1 : thirdMatch.team2;
      }
    }

    return (
      <div className="space-y-2">
        {isFinal && finished && (podium.champion || podium.runnerUp || podium.third) && (
          <div className="rounded-lg bg-gradient-to-b from-primary/15 to-card border border-primary/30 p-4 mb-3">
            <div className="flex items-center justify-center gap-2 mb-5">
              <Trophy className="w-5 h-5 text-yellow-400" />
              <span className="text-sm font-bold text-foreground uppercase tracking-wider">
                Pódio Champions 25/26
              </span>
              <Trophy className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="flex items-end justify-center gap-3">
              <PodiumSlot
                place={2}
                name={podium.runnerUp}
                badge={podium.runnerUp ? findBadge(podium.runnerUp) : undefined}
                heightClass="h-14"
                bgClass="bg-slate-400/25 border-slate-300/40"
                labelColor="text-slate-200"
                isUser={!!podium.runnerUp && (isUserTeam?.(podium.runnerUp) ?? false)}
              />
              <PodiumSlot
                place={1}
                name={podium.champion}
                badge={podium.champion ? findBadge(podium.champion) : undefined}
                heightClass="h-24"
                bgClass="bg-yellow-500/25 border-yellow-400/50"
                labelColor="text-yellow-300"
                isUser={!!podium.champion && (isUserTeam?.(podium.champion) ?? false)}
                big
              />
              <PodiumSlot
                place={3}
                name={podium.third}
                badge={podium.third ? findBadge(podium.third) : undefined}
                heightClass="h-10"
                bgClass="bg-amber-700/30 border-amber-600/40"
                labelColor="text-amber-400"
                isUser={!!podium.third && (isUserTeam?.(podium.third) ?? false)}
              />
            </div>
          </div>
        )}
        {knockoutData?.rodadaInfo && (
          <div className="text-center mb-2">
            <p className="text-xs text-muted-foreground">{knockoutData.rodadaInfo}</p>
          </div>
        )}

        {matches.map((match, idx) => {
          const id1 = teamNameToId.get(match.team1?.toUpperCase());
          const id2 = teamNameToId.get(match.team2?.toUpperCase());
          const hasIds = !!id1 && !!id2;
          // Mata-mata: clicável apenas na rodada atual (leg ativo) com mercado fechado
          const isEnabled = hasIds && statusMercado === 2 && activeLeg !== null;
          const ps1 = id1 ? koPartials.scores.get(id1) : undefined;
          const ps2 = id2 ? koPartials.scores.get(id2) : undefined;
          const pc1 = id1 ? koPartials.played.get(id1) : undefined;
          const pc2 = id2 ? koPartials.played.get(id2) : undefined;
          return (
            <CupMatchCard
              key={`${match.matchNumber}-${idx}`}
              match={match}
              badgeUrls={badgeUrls}
              isFinal={isFinal}
              isUserTeam={isUserTeam}
              disabled={!isEnabled}
              onMatchClick={hasIds ? () => handleMatchClick(id1!, id2!, rodadaBase) : undefined}
              activeLeg={activeLeg}
              partialScore1={ps1}
              partialScore2={ps2}
              playedCount1={pc1}
              playedCount2={pc2}
            />
          );
        })}
      </div>
    );
  };

  // Empty state baseado em sinais de cache global (não na rodada visível)
  const classEmpty = !classData?.rows?.length;
  const dadosEmpty = !dadosExternos?.rows?.length;
  const hasAnyData = !classEmpty || !dadosEmpty;
  const allLoading = classLoading || ligaLoading || knockoutLoading;

  if (!hasAnyData && !allLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Trophy className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="text-sm font-semibold text-foreground mb-1">Champions League</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Dados da Champions ainda não foram sincronizados.
        </p>
      </div>
    );
  }

  const partialEmpty = hasAnyData && (classEmpty || dadosEmpty);

  return (
    <div className="space-y-4">
      {partialEmpty && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          Alguns dados estão indisponíveis. Aguarde atualização do sistema.
        </div>
      )}
      <div className="flex items-center gap-3">
        <Trophy className="w-4 h-4 text-primary flex-shrink-0" />
        <Select value={fase} onValueChange={(v) => { if (FASES.includes(v)) setFase(v); }}>
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

      {isClassificacao ? renderClassificacao() : isLeaguePhase ? renderFaseLiga() : renderKnockout()}
    </div>
  );
};

export default ChampionsLeagueView;
