import { useCallback, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Archive, CalendarDays, Loader2, RefreshCw, Trophy, AlertTriangle, Database } from 'lucide-react';
import { toast } from 'sonner';
import {
  buildSeasonHistoryPreview,
  SEASON_HISTORY_CACHE_KEYS,
  type SeasonHistoryPreview,
} from '@/lib/seasonHistoryPreview';

const AdminSeasonHistory = () => {
  const [season, setSeason] = useState('2026');
  const [preview, setPreview] = useState<SeasonHistoryPreview | null>(null);
  const [loading, setLoading] = useState(false);

  const generatePreview = useCallback(async () => {
    const parsedSeason = Number(season);
    if (!Number.isInteger(parsedSeason) || parsedSeason !== 2026) {
      toast.error('Esta primeira etapa de coleta está preparada exclusivamente para a temporada 2026.');
      return;
    }

    setLoading(true);
    setPreview(null);
    const { data, error } = await supabase
      .from('sheets_cache')
      .select('cache_key, type, synced_at, data')
      .in('cache_key', [...SEASON_HISTORY_CACHE_KEYS]);

    if (error) {
      toast.error('Não foi possível ler os caches da temporada: ' + error.message);
      setLoading(false);
      return;
    }

    const result = buildSeasonHistoryPreview(parsedSeason, (data ?? []) as any);
    setPreview(result);
    setLoading(false);
    toast.success('Prévia gerada. Nenhum dado foi gravado ou arquivado.');
  }, [season]);

  const completeTournaments = preview?.tournaments.filter(item => item.status === 'complete').length ?? 0;
  const pendingTournaments = preview?.tournaments.filter(item => item.status === 'pending').length ?? 0;
  const missingTournaments = preview?.tournaments.filter(item => item.status === 'not_found').length ?? 0;

  return (
    <AppLayout>
      <div className="p-4 space-y-5 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <Archive className="h-6 w-6 text-primary" />
          <div>
            <p className="text-sm text-muted-foreground">Administração</p>
            <h1 className="text-2xl font-bold">Histórico de temporadas</h1>
          </div>
        </div>

        <Alert>
          <Database className="h-4 w-4" />
          <AlertDescription>
            Esta etapa faz somente leitura dos caches existentes para montar uma prévia. Não cria rascunhos,
            não altera os caches e não arquiva informações.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" /> Coleta e conferência da temporada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="archive-season">Temporada</Label>
              <Input id="archive-season" inputMode="numeric" value={season} onChange={event => setSeason(event.target.value)} />
            </div>
            <Button className="w-full" onClick={() => void generatePreview()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {loading ? 'Lendo caches...' : 'Gerar prévia dos dados'}
            </Button>
          </CardContent>
        </Card>

        {preview && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Classificação anual</p><p className="text-2xl font-bold">{preview.standings.length}</p><p className="text-xs text-muted-foreground">equipes encontradas</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Torneios completos</p><p className="text-2xl font-bold">{completeTournaments}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pendentes</p><p className="text-2xl font-bold">{pendingTournaments}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Sem cache</p><p className="text-2xl font-bold">{missingTournaments}</p></CardContent></Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Alertas da coleta</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {preview.warnings.map((warning, index) => (
                  <div key={index} className="flex gap-2 text-sm text-muted-foreground">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                    <span>{warning}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Classificação anual — {preview.season}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Fonte: {preview.rankingSource?.cacheKey ?? 'não encontrada'}
                  {preview.rankingSource?.syncedAt ? ` · Atualizado em ${new Date(preview.rankingSource.syncedAt).toLocaleString('pt-BR')}` : ''}
                </p>
              </CardHeader>
              <CardContent>
                {preview.standings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma equipe encontrada no ranking anual.</p>
                ) : (
                  <div className="max-h-[520px] overflow-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted">
                        <tr><th className="p-2 text-left">Pos.</th><th className="p-2 text-left">Equipe</th><th className="p-2 text-right">Pontos</th></tr>
                      </thead>
                      <tbody>
                        {preview.standings.map(row => (
                          <tr key={row.position} className="border-t">
                            <td className="p-2">{row.position}º</td>
                            <td className="p-2">
                              <div className="flex items-center gap-2">
                                {row.badgeUrl ? <img src={row.badgeUrl} alt="" className="h-6 w-6 object-contain" /> : <span className="h-6 w-6 rounded-full bg-muted" />}
                                <span>{row.teamName}<span className="block text-[10px] text-muted-foreground">ID Cartola: {row.cartolaTeamId ?? 'não identificado'}</span></span>
                              </div>
                            </td>
                            <td className="p-2 text-right tabular-nums">{row.totalPoints?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <section className="space-y-3">
              <h2 className="font-semibold">Fontes dos torneios e pódios identificados</h2>
              {preview.tournaments.map(tournament => (
                <Card key={tournament.slug}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-base">{tournament.name}</CardTitle>
                      <Badge variant={tournament.status === 'complete' ? 'default' : 'secondary'}>
                        {tournament.status === 'complete' ? 'Pódio identificado' : tournament.status === 'pending' ? 'Pendente' : 'Sem cache'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tournament.sourceCacheKey ?? 'Fonte não encontrada'}
                      {tournament.sourceSyncedAt ? ` · ${new Date(tournament.sourceSyncedAt).toLocaleString('pt-BR')}` : ''}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {tournament.podium.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {tournament.podium.map(entry => (
                          <div key={entry.position} className="rounded-md border p-3 flex items-center gap-2">
                            {entry.badgeUrl ? <img src={entry.badgeUrl} alt="" className="h-8 w-8 object-contain" /> : <Trophy className="h-5 w-5 text-muted-foreground" />}
                            <div className="min-w-0">
                              <p className="text-xs text-muted-foreground">{entry.position}º lugar</p>
                              <p className="text-sm font-medium truncate">{entry.teamName}</p>
                              {entry.decidedManually && <p className="text-[11px] text-amber-600">Decisão manual</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {tournament.warnings.map((warning, index) => (
                      <p key={index} className="text-xs text-amber-600">{warning}</p>
                    ))}
                    {tournament.alternateSources.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Fontes alternativas preservadas: {tournament.alternateSources.map(source => source.cacheKey).join(', ')}
                      </p>
                    )}
                    {tournament.finalMatches.length > 0 && (
                      <p className="text-xs text-muted-foreground">{tournament.finalMatches.length} confronto(s) encontrados na fase final.</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default AdminSeasonHistory;
