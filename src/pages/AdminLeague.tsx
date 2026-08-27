import AppLayout from '@/components/layout/AppLayout';
import { Medal, Lock, Unlock, Loader2, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ALL_PERIODS, CURRENT_SEASON_YEAR, getLabelFromKey } from '@/utils/leaguePeriods';
import { useLeagueClosedPeriods } from '@/hooks/useLeagueClosedPeriods';
import { useLeagueDisabledPeriods } from '@/hooks/useLeagueDisabledPeriods';
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

const AdminLeague = () => {
  const { isPeriodClosed, isLoading, closePeriod, reopenPeriod } = useLeagueClosedPeriods();
  const { isPeriodDisabled, isLoading: isLoadingDisabled, disablePeriod, enablePeriod } = useLeagueDisabledPeriods();

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
