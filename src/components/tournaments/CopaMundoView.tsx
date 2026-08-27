import { useTournamentFinished } from '@/hooks/useTournamentFinished';
import TournamentPodium from './TournamentPodium';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Loader2, AlertCircle, ChevronLeft, ChevronRight, Globe, ListOrdered, Users, Swords, Medal, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useDadosExternosCopaMundo,
  useClassificacaoCopaMundo,
  useConfrontosCopaMundoFaseGrupos,
  useConfrontosCopaMundo,
  useCopaMundoData,
  type CopaMundoMatch,
  type Confronto,
} from '@/hooks/useGoogleSheets';
import { usePartialScores } from '@/hooks/usePartialScores';
import {
  type CopaMundoPhase,
  COPA_MUNDO_PHASE_LABELS,
  COPA_MUNDO_KO_PHASES,
  COPA_MUNDO_CACHE_VERSION,
} from '@/config/copaMundoPhases';
import MatchCard from './MatchCard';
import CupMatchCard from './CupMatchCard';
import { buildTeamIdMap } from '@/utils/matchComparison';
import { useUserTeamIds, buildIsUserTeamById } from '@/hooks/useUserTeamIds';
import { useUserTeamNames } from '@/hooks/useUserTeamNames';

type ViewTab = 'classificacao' | CopaMundoPhase;

const TAB_ORDER: ViewTab[] = ['classificacao', 'fase_grupos', '16avos', 'oitavas', 'quartas', 'semifinal', 'final'];

const normalizeName = (n: string) =>
  n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

interface Props {
  isUserTeam?: (name: string) => boolean;
  rodadaBase?: number;
  statusMercado?: number;
  slug?: string;
  initialFase?: string;
  initialRodadaGrupos?: number;
}

const phaseFromRodada = (r?: number): ViewTab | null => {
  if (!r) return null;
  if (r >= 1 && r <= 3) return 'fase_grupos';
  if (r === 4) return '16avos';
  if (r === 5) return 'oitavas';
  if (r === 6) return 'quartas';
  if (r === 7) return 'semifinal';
  if (r === 8) return 'final';
  return null;
};

const CopaMundoView = ({ rodadaBase, statusMercado, slug, initialFase, initialRodadaGrupos }: Props) => {
  const { finished } = useTournamentFinished(slug);
  const userIds = useUserTeamIds();
  const { teamNames: userTeamNames } = useUserTeamNames();
  const navigate = useNavigate();

  const autoPhase = phaseFromRodada(rodadaBase);
  const initialTab: ViewTab = (TAB_ORDER as string[]).includes(initialFase ?? '')
    ? (initialFase as ViewTab)
    : (autoPhase ?? 'classificacao');
  const autoRodadaGrupos =
    rodadaBase && rodadaBase >= 1 && rodadaBase <= 3 ? rodadaBase : 1;
  const [tab, setTab] = useState<ViewTab>(initialTab);
  const [rodadaGrupos, setRodadaGrupos] = useState<number>(
    initialRodadaGrupos ?? autoRodadaGrupos,
  );

  const isClassificacao = tab === 'classificacao';
  const isFaseGrupos = tab === 'fase_grupos';
  const isFinal = tab === 'final';
  const isKO = !isClassificacao && !isFaseGrupos;

  const { data: dadosExternos } = useDadosExternosCopaMundo();
  const { data: classData, isLoading: classLoading, error: classError } = useClassificacaoCopaMundo();
  const { data: grpData, isLoading: grpLoading, error: grpError } =
    useConfrontosCopaMundoFaseGrupos(isFaseGrupos ? rodadaGrupos : 0);
  const { data: koData, isLoading: koLoading, error: koError } =
    useConfrontosCopaMundo(isKO ? (tab as Exclude<CopaMundoPhase, 'fase_grupos'>) : '16avos');
  const { data: rootCache } = useCopaMundoData();

  const badgeUrls = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of dadosExternos?.rows ?? []) {
      const name = row.team_name?.trim();
      const url = row.logo_url?.trim();
      if (name && url && url.startsWith('http')) {
        map[name] = url;
        map[name.toUpperCase()] = url;
        map[name.toLowerCase()] = url;
        map[normalizeName(name)] = url;
      }
    }
    return map;
  }, [dadosExternos]);

  const teamNameToId = useMemo(() => {
    if (!dadosExternos?.rows) return new Map<string, string>();
    // buildTeamIdMap espera linhas [team_name, id_cartola, ...] (raw rows da planilha)
    const rawRows = dadosExternos.rows.map((r) => [r.team_name, r.id_cartola, r.logo_url]);
    return buildTeamIdMap(rawRows);
  }, [dadosExternos]);

  const isUserTeam = useMemo(
    () => buildIsUserTeamById(teamNameToId, userIds, userTeamNames),
    [teamNameToId, userIds, userTeamNames],
  );

  const isCurrentRoundView =
    (isFaseGrupos && !!rodadaBase && rodadaBase >= 1 && rodadaBase <= 3 && rodadaGrupos === rodadaBase) ||
    (isKO && autoPhase === tab);
  const partialsEnabled = statusMercado === 2 && !!rodadaBase && isCurrentRoundView;

  const allMatches = useMemo<Confronto[]>(() => {
    if (isFaseGrupos) {
      const groups = grpData?.groups ?? {};
      return Object.values(groups).flatMap((g: any) => g.matches ?? []);
    }
    if (isKO) {
      return (koData?.matches ?? []).map((m: CopaMundoMatch) => ({
        team1: m.team1,
        team2: m.team2,
        score1: m.scoreIda1 ?? '',
        score2: m.scoreIda2 ?? '',
        matchOrder: 0,
        league: 'copa_mundo',
      })) as Confronto[];
    }
    return [];
  }, [isFaseGrupos, isKO, grpData, koData]);

  const { scores: partialScores, playedCounts } = usePartialScores(
    allMatches,
    teamNameToId,
    rodadaBase ?? 0,
    rodadaBase,
    statusMercado,
    partialsEnabled,
    'copa_mundo',
  );

  const canCompare = statusMercado === 2 && isCurrentRoundView;

  const handleMatchClick = (id1: string, id2: string) => {
    if (!rodadaBase || statusMercado !== 2 || !isCurrentRoundView) return;
    const params = new URLSearchParams({
      id1, id2,
      rodada: String(rodadaBase),
      statusMercado: String(statusMercado),
      tab: 'confrontos',
      fase: tab,
      league: 'copa_mundo',
    });
    if (slug) params.set('slug', slug);
    if (isFaseGrupos) params.set('rodadaGrupos', String(rodadaGrupos));
    navigate(`/match-comparison?${params.toString()}`);
  };

  const renderEmpty = (label: string) => (
    <p className="text-center text-sm text-muted-foreground py-8">{label}</p>
  );

  const renderClassificacao = () => {
    if (classLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
    if (classError) return <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex gap-2 items-center"><AlertCircle className="w-4 h-4" />Erro: {classError.message}</div>;
    const grupos = classData?.grupos ?? {};
    const groupKeys = Object.keys(grupos).sort();
    if (groupKeys.length === 0) return renderEmpty('Classificação ainda não disponível.');

    const parseNum = (s?: string) => {
      if (s == null) return 0;
      const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };
    const sortFn = (a: any, b: any) => {
      const dp = parseNum(b.pontos) - parseNum(a.pontos);
      if (dp !== 0) return dp;
      const dv = parseNum(b.vitorias) - parseNum(a.vitorias);
      if (dv !== 0) return dv;
      const ds = parseNum(b.saldo) - parseNum(a.saldo);
      if (ds !== 0) return ds;
      return parseNum(b.gols_pro) - parseNum(a.gols_pro);
    };
    const sortedByGroup: Record<string, any[]> = {};
    groupKeys.forEach((g) => {
      sortedByGroup[g] = [...(grupos[g] ?? [])].sort(sortFn);
    });
    const thirds = groupKeys
      .map((g) => ({ g, row: sortedByGroup[g][2] }))
      .filter((x) => x.row);
    thirds.sort((a, b) => sortFn(a.row, b.row));
    const bestThirdsSet = new Set(thirds.slice(0, 8).map((x) => `${x.g}-${x.row.team_name}`));

    return (
      <div className="space-y-4">
        {groupKeys.map((g) => {
          const rows = sortedByGroup[g];
          return (
            <div key={g} className="space-y-1">
              <p className="text-xs font-bold text-primary uppercase tracking-wider px-2">Grupo {g}</p>
              <div className="flex items-center px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                <div className="w-5 text-center flex-shrink-0">#</div>
                <div className="flex-1 min-w-0 pl-1">TIME</div>
                {['P', 'J', 'V', 'E', 'D', 'SG'].map((h) => (
                  <div key={h} className="w-7 text-center flex-shrink-0">{h}</div>
                ))}
              </div>
              {rows.map((row, idx) => {
                const badge = badgeUrls[row.team_name.toUpperCase()] || badgeUrls[row.team_name] || badgeUrls[normalizeName(row.team_name)];
                const highlighted = isUserTeam?.(row.team_name);
                const pos = idx + 1;
                const isQualified = pos <= 2 || (pos === 3 && bestThirdsSet.has(`${g}-${row.team_name}`));
                return (
                  <div
                    key={`${g}-${row.team_name}`}
                    className={`flex items-center px-2 py-2 rounded-lg ${highlighted ? 'bg-red-500/25 border border-red-400/40' : 'bg-primary/15 border border-primary/20'}`}
                  >
                    <div className={`w-5 text-center flex-shrink-0 text-[10px] font-bold ${isQualified ? 'text-emerald-400' : 'text-muted-foreground'}`}>{pos}</div>
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                        {badge && <img src={badge} alt={row.team_name} className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                      </div>
                      <span className={`text-xs font-semibold truncate ${highlighted ? 'text-red-300 font-bold' : 'text-foreground'}`}>{row.team_name}</span>
                    </div>
                    {[row.pontos, row.jogos, row.vitorias, row.empates, row.derrotas, row.saldo].map((v, i) => (
                      <div key={i} className="w-7 text-center flex-shrink-0 text-[10px] text-muted-foreground">{v || ''}</div>
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


  const renderFaseGrupos = () => {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => setRodadaGrupos((r) => Math.max(1, r - 1))} disabled={rodadaGrupos <= 1}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Rodada {rodadaGrupos}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setRodadaGrupos((r) => Math.min(3, r + 1))} disabled={rodadaGrupos >= 3}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {grpLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}
        {grpError && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">Erro: {grpError.message}</div>}
        {!grpLoading && !grpError && (
          <div className="space-y-4">
            {Object.keys(grpData?.groups ?? {}).sort().map((g) => {
              const matches = grpData!.groups[g].matches;
              return (
                <div key={g} className="space-y-2">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider px-2">Grupo {g}</p>
                  {matches.map((m, idx) => {
                    const id1 = teamNameToId.get(m.team1?.toUpperCase());
                    const id2 = teamNameToId.get(m.team2?.toUpperCase());
                    const hasIds = !!id1 && !!id2;
                    return (
                      <MatchCard
                        key={`${g}-${idx}`}
                        match={m}
                        badgeUrls={badgeUrls}
                        isUserTeam={isUserTeam}
                        disabled={!hasIds || !canCompare}
                        onMatchClick={hasIds && canCompare ? () => handleMatchClick(id1!, id2!) : undefined}
                        partialScore1={partialsEnabled && id1 ? partialScores.get(id1) : undefined}
                        partialScore2={partialsEnabled && id2 ? partialScores.get(id2) : undefined}
                        playedCount1={partialsEnabled && id1 ? playedCounts.get(id1) : undefined}
                        playedCount2={partialsEnabled && id2 ? playedCounts.get(id2) : undefined}
                      />
                    );
                  })}
                </div>
              );
            })}
            {Object.keys(grpData?.groups ?? {}).length === 0 && renderEmpty('Confrontos desta rodada ainda não disponíveis.')}
          </div>
        )}
      </div>
    );
  };

  const renderKO = () => {
    if (koLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
    if (koError) return <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">Erro: {koError.message}</div>;
    const matches = (koData?.matches ?? []) as CopaMundoMatch[];
    if (matches.length === 0) return renderEmpty('Confrontos desta fase ainda não disponíveis.');

    let podium: { champion?: string; runnerUp?: string; third?: string } = {};
    if (isFinal && finished) {
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
        if (s1 >= s2) { podium.champion = finalMatch.team1; podium.runnerUp = finalMatch.team2; }
        else { podium.champion = finalMatch.team2; podium.runnerUp = finalMatch.team1; }
      }
      if (thirdMatch) {
        const s1 = parse(thirdMatch.scoreIda1);
        const s2 = parse(thirdMatch.scoreIda2);
        podium.third = s1 >= s2 ? thirdMatch.team1 : thirdMatch.team2;
      }
    }
    const findBadge = (n?: string) => n ? (badgeUrls[n] || badgeUrls[n.toUpperCase()]) : undefined;

    return (
      <div className="space-y-2">
        {isFinal && finished && (
          <TournamentPodium
            title="Pódio Copa do Mundo 2026"
            champion={podium.champion}
            runnerUp={podium.runnerUp}
            third={podium.third}
            championBadge={findBadge(podium.champion)}
            runnerUpBadge={findBadge(podium.runnerUp)}
            thirdBadge={findBadge(podium.third)}
            isUserTeam={isUserTeam}
          />
        )}
        {matches.map((m, idx) => {
          const id1 = teamNameToId.get(m.team1?.toUpperCase());
          const id2 = teamNameToId.get(m.team2?.toUpperCase());
          const hasIds = !!id1 && !!id2;
          if (isFinal) {
            return (
              <CupMatchCard
                key={`${m.matchNumber}-${idx}`}
                match={m}
                badgeUrls={badgeUrls}
                isFinal
                isUserTeam={isUserTeam}
                disabled={!hasIds || !canCompare}
                onMatchClick={hasIds && canCompare ? () => handleMatchClick(id1!, id2!) : undefined}
                partialScore1={partialsEnabled && id1 ? partialScores.get(id1) : undefined}
                partialScore2={partialsEnabled && id2 ? partialScores.get(id2) : undefined}
                playedCount1={partialsEnabled && id1 ? playedCounts.get(id1) : undefined}
                playedCount2={partialsEnabled && id2 ? playedCounts.get(id2) : undefined}
              />
            );
          }
          // Jogo único — usa MatchCard com placar simples
          const single = {
            team1: m.team1,
            team2: m.team2,
            score1: m.scoreIda1,
            score2: m.scoreIda2,
            matchOrder: idx + 1,
          };
          return (
            <div key={`${m.matchNumber}-${idx}`} className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground text-center uppercase tracking-wider">
                Jogo {m.matchNumber}
              </p>
              <MatchCard
                match={single}
                badgeUrls={badgeUrls}
                isUserTeam={isUserTeam}
                disabled={!hasIds || !canCompare}
                onMatchClick={hasIds && canCompare ? () => handleMatchClick(id1!, id2!) : undefined}
                partialScore1={partialsEnabled && id1 ? partialScores.get(id1) : undefined}
                partialScore2={partialsEnabled && id2 ? partialScores.get(id2) : undefined}
                playedCount1={partialsEnabled && id1 ? playedCounts.get(id1) : undefined}
                playedCount2={partialsEnabled && id2 ? playedCounts.get(id2) : undefined}
              />
            </div>
          );
        })}
      </div>
    );
  };

  // Empty state global e banner de versão
  const cacheVersionInvalid = rootCache && rootCache.version !== COPA_MUNDO_CACHE_VERSION;
  const classEmpty = !classData || Object.keys(classData.grupos ?? {}).length === 0;
  const dadosEmpty = !dadosExternos || (dadosExternos.rows?.length ?? 0) === 0;
  const allLoading = classLoading || grpLoading || koLoading;
  const hasAnyData = !classEmpty || !dadosEmpty;

  if (statusMercado === 4) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertCircle className="w-12 h-12 text-amber-400 mb-3" />
        <p className="text-base font-semibold text-foreground">Mercado em manutenção</p>
      </div>
    );
  }

  if (!hasAnyData && !allLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Globe className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="text-sm font-semibold text-foreground mb-1">Copa do Mundo FIFA</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Dados da Copa do Mundo ainda não foram sincronizados.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(cacheVersionInvalid || (hasAnyData && (classEmpty || dadosEmpty))) && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          Alguns dados da Copa ainda não foram sincronizados.
        </div>
      )}

      <div className="w-full sm:max-w-xs">
        <Select value={tab} onValueChange={(v) => setTab(v as ViewTab)}>
          <SelectTrigger className="w-full h-11 bg-card border-border text-foreground font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {TAB_ORDER.map((t) => {
              const label = t === 'classificacao' ? 'Classificação' : COPA_MUNDO_PHASE_LABELS[t as CopaMundoPhase];
              const Icon =
                t === 'classificacao' ? ListOrdered
                : t === 'fase_grupos' ? Users
                : t === '16avos' || t === 'oitavas' ? Swords
                : t === 'quartas' ? Medal
                : t === 'semifinal' ? Trophy
                : Crown;
              const active = tab === t;
              return (
                <SelectItem
                  key={t}
                  value={t}
                  className={`cursor-pointer ${active ? 'bg-primary/15 text-primary focus:bg-primary/20 focus:text-primary' : ''}`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    <span className="font-medium">{label}</span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>


      {isClassificacao && renderClassificacao()}
      {isFaseGrupos && renderFaseGrupos()}
      {isKO && renderKO()}
    </div>
  );
};

export { COPA_MUNDO_KO_PHASES };
export default CopaMundoView;
