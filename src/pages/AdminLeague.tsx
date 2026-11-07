import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Medal, Lock, Unlock, Loader2, EyeOff, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ALL_PERIODS, CURRENT_SEASON_YEAR, getLabelFromKey } from '@/utils/leaguePeriods';
import { useLeagueClosedPeriods } from '@/hooks/useLeagueClosedPeriods';
import { useLeagueDisabledPeriods } from '@/hooks/useLeagueDisabledPeriods';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const groupLabels: Record<string, string> = {
  geral: 'Geral',
  turno: 'Turnos',
  mes: 'Meses',
};

type ClassicSyncResult = {
  ok?: boolean;
  already_complete?: boolean;
  season?: number;
  round?: number;
  market_round?: number;
  market_status?: number;
  expected_team_count?: number;
  received_team_count?: number;
  snapshot_id?: string;
  error?: string;
};

const AdminLeague = () => {
  const { isPeriodClosed, isLoading, closePeriod, reopenPeriod } = useLeagueClosedPeriods();
  const { isPeriodDisabled, isLoading: isLoadingDisabled, disablePeriod, enablePeriod } = useLeagueDisabledPeriods();
  const [syncingClassicLeague, setSyncingClassicLeague] = useState(false);
  const [classicSyncResult, setClassicSyncResult] = useState<ClassicSyncResult | null>(null);
  const [classicSyncError, setClassicSyncError] = useState<string | null>(null);

  const runClassicLeagueSync = async () => {
    setSyncingClassicLeague(true);
    setClassicSyncResult(null);
    setClassicSyncError(null);

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.access_token) {
        throw new Error('Sua sessão expirou. Entre novamente no aplicativo e tente outra vez.');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-classic-league?season=${CURRENT_SEASON_YEAR}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
        },
      );

      const result = await response.json().catch(() => ({})) as ClassicSyncResult;
      if (!response.ok || result.ok !== true) {
        throw new Error(result.error || `A sincronização falhou (HTTP ${response.status}).`);
      }

      setClassicSyncResult(result);
    } catch (error) {
      setClassicSyncError(error instanceof Error ? error.message : 'Erro inesperado ao sincronizar a Liga Clássica.');
    } finally {
      setSyncingClassicLeague(false);
    }
  };

  const grouped = {
    geral: ALL_PERIODS.filter(p => p.group === 'geral'),
    turno: ALL_PERIODS.filter(p => p.group === 'turno'),
    mes: ALL_PERIODS.filter(p => p.group === 'mes'),
  };

  return (
    <AppLayout>
      <div className="p-4">
        <div className="flex items-center gap-3 mb-2">
          <Medal className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Liga Clássica</h1>
        </div>
        <p className="text-xs text-muted-foreground mb-6">Temporada {CURRENT_SEASON_YEAR}</p>

        <Card className="mb-6 border-primary/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Teste de sincronização pela API</h2>
              <Badge variant="outline">Admin</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Consulta os 60 participantes na API do Cartola e grava um snapshot da rodada concluída.
              Não altera o ranking atual nem a sincronização pela planilha.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="w-full" disabled={syncingClassicLeague}>
                  {syncingClassicLeague ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  {syncingClassicLeague ? 'Consultando os 60 participantes...' : 'Testar sincronização'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Executar teste da Liga Clássica?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A API será consultada para os 60 times da temporada {CURRENT_SEASON_YEAR}.
                    Os dados serão gravados como snapshot da última rodada considerada concluída.
                    O ranking em produção e a sincronização pela planilha não serão alterados.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={runClassicLeagueSync}>
                    Confirmar teste
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {classicSyncResult && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  {classicSyncResult.already_complete ? 'Snapshot desta rodada já estava completo' : 'Snapshot gravado com sucesso'}
                </div>
                <p className="text-xs text-foreground">
                  Temporada {classicSyncResult.season} · Rodada {classicSyncResult.round} ·
                  {' '}{classicSyncResult.received_team_count}/{classicSyncResult.expected_team_count} participantes
                </p>
                {classicSyncResult.snapshot_id && (
                  <p className="text-[10px] text-muted-foreground break-all">Snapshot: {classicSyncResult.snapshot_id}</p>
                )}
              </div>
            )}

            {classicSyncError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{classicSyncError}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {(isLoading || isLoadingDisabled) ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {(['geral', 'turno', 'mes'] as const).map(group => (
              <div key={group}>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2">{groupLabels[group]}</h2>
                <div className="space-y-2">
                  {grouped[group].map(period => {
                    const closed = isPeriodClosed(period.label);
                    const disabled = group === 'mes' && isPeriodDisabled(period.label);
                    return (
                      <Card key={period.key} className="bg-card border-border">
                        <CardContent className="flex items-center justify-between p-3 gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            {closed ? (
                              <Lock className="w-4 h-4 text-destructive flex-shrink-0" />
                            ) : (
                              <Unlock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <span className={`text-sm font-medium truncate ${disabled ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{period.label}</span>
                            {closed && <Badge variant="destructive" className="text-[10px]">Fechado</Badge>}
                            {disabled && <Badge variant="outline" className="text-[10px] gap-1"><EyeOff className="w-3 h-3" />Inativo</Badge>}
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {group === 'mes' && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground">Ativo</span>
                                <Switch
                                  checked={!disabled}
                                  onCheckedChange={(checked) =>
                                    checked
                                      ? enablePeriod.mutate(period.label)
                                      : disablePeriod.mutate(period.label)
                                  }
                                />
                              </div>
                            )}

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant={closed ? 'outline' : 'destructive'}
                                  size="sm"
                                  className="text-xs"
                                >
                                  {closed ? 'Reabrir' : 'Fechar'}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {closed ? 'Reabrir período?' : 'Fechar período?'}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {closed
                                      ? `O período "${period.label}" será reaberto e o destaque de vencedor será removido.`
                                      : `O período "${period.label}" será marcado como encerrado e o vencedor será destacado no ranking.`}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      closed
                                        ? reopenPeriod.mutate(period.label)
                                        : closePeriod.mutate(period.label)
                                    }
                                  >
                                    Confirmar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default AdminLeague;
