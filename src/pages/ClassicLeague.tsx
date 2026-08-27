import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Medal, Trophy, TrendingUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, AlertCircle, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useRankingLiga, fetchRankingLiga } from '@/hooks/useGoogleSheets';
import { useUserTeamNames } from '@/hooks/useUserTeamNames';
import { useLeagueClosedPeriods } from '@/hooks/useLeagueClosedPeriods';
import { useLeagueDisabledPeriods } from '@/hooks/useLeagueDisabledPeriods';
import { MESES } from '@/utils/leaguePeriods';
import { useAppLeague } from '@/contexts/AppLeagueContext';

const parseNum = (v: string) => Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0;

const PERIODOS = [
  { label: 'Anual', value: 'ANUAL' },
  { label: '1º Turno', value: '1º TURNO' },
  { label: '2º Turno', value: '2º TURNO' },
  { label: 'Mensal', value: 'MENSAL' },
];

const MESES_ALL = MESES.map(m => m.label);

const ClassicLeague = () => {
  const navigate = useNavigate();
  const { league, clearLeague } = useAppLeague();
  const queryClient = useQueryClient();
  const [periodoTab, setPeriodoTab] = useState('ANUAL');
  const { isPeriodDisabled } = useLeagueDisabledPeriods();

  const MESES_LABELS = MESES_ALL.filter(m => !isPeriodDisabled(m));
  const currentMonthIdx = MESES_LABELS.indexOf(MESES_ALL[new Date().getMonth() - 1] ?? '');
  const [mesIndex, setMesIndex] = useState(0);

  useEffect(() => {
    if (MESES_LABELS.length === 0) return;
    setMesIndex(prev => {
      if (prev >= MESES_LABELS.length) return MESES_LABELS.length - 1;
      return prev;
    });
  }, [MESES_LABELS.length]);

  useEffect(() => {
    if (MESES_LABELS.length === 0) return;
    const initial = currentMonthIdx >= 0 ? currentMonthIdx : 0;
    setMesIndex(initial);
    const periodsToPrefetch = ['ANUAL', '1º TURNO', '2º TURNO', MESES_LABELS[initial]];
    const unique = [...new Set(periodsToPrefetch)];
    unique.forEach(p => {
      queryClient.prefetchQuery({
        queryKey: ['ranking-liga', p],
        queryFn: () => fetchRankingLiga(p),
        staleTime: 30 * 60 * 1000,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [MESES_LABELS.length]);

  const isMensal = periodoTab === 'MENSAL';
  const isAnual = periodoTab === 'ANUAL';
  const activeSheet = isMensal ? (MESES_LABELS[mesIndex] ?? '') : periodoTab;

  const { data, isLoading, error } = useRankingLiga(activeSheet);
  const { isUserTeam } = useUserTeamNames();
  const { isPeriodClosed } = useLeagueClosedPeriods();

  const isClosed = activeSheet ? isPeriodClosed(activeSheet) : false;
  const showTopCards = isClosed && isAnual;
  const showChampion = isClosed && !isAnual;

  const getPositionColor = (pos: number) => {
    if (showTopCards && pos <= 3) return 'text-green-500';
    if (showChampion && pos === 1) return 'text-green-500';
    return 'text-muted-foreground';
  };

  const rankings = (data?.rankings || [])
    .slice()
    .sort((a, b) => parseNum(b.total) - parseNum(a.total))
    .map((r, idx) => ({ ...r, position: String(idx + 1) }));

  // Bloqueio: Liga só está disponível para Brasileirão
  if (league && league !== 'brasileirao') {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center p-12 gap-4 text-center">
          <Medal className="w-12 h-12 text-muted-foreground" />
          <p className="text-base font-semibold text-foreground">
            Ranking disponível apenas para o Brasileirão
          </p>
          <Button
            variant="outline"
            onClick={() => {
              clearLeague();
              navigate('/league-select');
            }}
          >
            <ArrowRightLeft className="w-4 h-4 mr-2" />
            Trocar competição
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <Medal className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Liga Clássica</h1>
        </div>

        <Tabs value={periodoTab} onValueChange={setPeriodoTab} className="mb-4">
          <TabsList className="w-full">
            {PERIODOS.map(p => (
              <TabsTrigger key={p.value} value={p.value} className="flex-1 text-xs">
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isMensal && (
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={() => setMesIndex(0)} disabled={mesIndex <= 0} className="text-muted-foreground hover:text-foreground">
              <ChevronsLeft className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setMesIndex(i => Math.max(0, i - 1))} disabled={mesIndex <= 0} className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="text-sm font-semibold text-foreground capitalize">
              {MESES_LABELS[mesIndex] ? MESES_LABELS[mesIndex].charAt(0) + MESES_LABELS[mesIndex].slice(1).toLowerCase() : '—'}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setMesIndex(i => Math.min(MESES_LABELS.length - 1, i + 1))} disabled={mesIndex >= MESES_LABELS.length - 1} className="text-muted-foreground hover:text-foreground">
              <ChevronRight className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setMesIndex(MESES_LABELS.length - 1)} disabled={mesIndex >= MESES_LABELS.length - 1} className="text-muted-foreground hover:text-foreground">
              <ChevronsRight className="w-5 h-5" />
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando ranking...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">Erro ao carregar ranking: {(error as Error).message}</p>
          </div>
        )}

        {!isLoading && !error && rankings.length > 0 && (
          <>
            {showTopCards && (
              <div className="grid grid-cols-3 gap-2 mb-6">
                {rankings.slice(0, 3).map((r, index) => (
                  <Card key={index} className={cn('glass-card text-center', index === 0 && 'ring-1 ring-green-500/50')}>
                    <CardContent className="p-3">
                      <div className={cn(
                        'w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-2 overflow-hidden',
                        !r.badge && 'bg-green-500/20'
                      )}>
                        {r.badge ? (
                          <img src={r.badge} alt={r.teamName} className="w-10 h-10 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        ) : index === 0 ? (
                          <Trophy className="w-5 h-5 text-green-500" />
                        ) : (
                          <span className="text-sm font-bold text-green-500">{r.position}</span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-foreground truncate">{r.teamName}</p>
                      <p className="text-sm font-bold text-primary mt-1">{r.total}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {showChampion && rankings.length > 0 && (
              <Card className="glass-card text-center ring-1 ring-green-500/50 mb-6">
                <CardContent className="p-4">
                  <div className={cn(
                    'w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-2 overflow-hidden',
                    !rankings[0].badge && 'bg-green-500/20'
                  )}>
                    {rankings[0].badge ? (
                      <img src={rankings[0].badge} alt={rankings[0].teamName} className="w-12 h-12 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <Trophy className="w-6 h-6 text-green-500" />
                    )}
                  </div>
                  <p className="text-sm font-semibold text-foreground">{rankings[0].teamName}</p>
                  <p className="text-lg font-bold text-primary mt-1">{rankings[0].total}</p>
                </CardContent>
              </Card>
            )}

            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  {data?.title || 'Classificação Geral'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground py-2 border-b border-border">
                    <div className="col-span-1">#</div>
                    <div className="col-span-2"></div>
                    <div className="col-span-6">Time</div>
                    <div className="col-span-3 text-right">Pts</div>
                  </div>

                  {rankings.map((r, idx) => {
                    const pos = parseInt(r.position) || idx + 1;
                    return (
                      <div key={idx} className={`grid grid-cols-12 gap-2 text-sm py-2 px-2 rounded-lg border items-center ${isUserTeam(r.teamName) ? 'bg-red-500/25 border-red-400/40' : 'border-transparent'}`}>
                        <div className={cn('col-span-1 font-bold', getPositionColor(pos))}>{r.position}</div>
                        <div className="col-span-2 flex justify-center">
                          {r.badge ? (
                            <img src={r.badge} alt={r.teamName} className="w-6 h-6 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                          ) : <div className="w-6 h-6" />}
                        </div>
                        <div className="col-span-6">
                          <p className={`font-medium truncate text-xs ${isUserTeam(r.teamName) ? 'text-red-300 font-bold' : 'text-foreground'}`}>{r.teamName}</p>
                        </div>
                        <div className="col-span-3 text-right font-semibold text-primary">{r.total}</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {!isLoading && !error && rankings.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum dado encontrado.</p>
        )}
      </div>
    </AppLayout>
  );
};

export default ClassicLeague;
