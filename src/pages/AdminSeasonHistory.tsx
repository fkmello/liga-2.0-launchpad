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
  type TournamentSettingSnapshot,
} from '@/lib/seasonHistoryPreview';

const AdminSeasonHistory = () => {
  const [season, setSeason] = useState('2026');
  const [preview, setPreview] = useState<SeasonHistoryPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [notPlayedTournaments, setNotPlayedTournaments] = useState<string[]>([]);
  const [seasonFinalized, setSeasonFinalized] = useState(false);
  const unresolvedKnockouts = preview?.tournaments.filter(
    item => item.kind === 'knockout' && item.status !== 'complete' && !notPlayedTournaments.includes(item.slug),
  ) ?? [];

  const generatePreview = useCallback(async () => {
    const parsedSeason = Number(season);
    if (!Number.isInteger(parsedSeason) || parsedSeason !== 2026) {
      toast.error('Esta primeira etapa de coleta está preparada exclusivamente para a temporada 2026.');
      return;
    }

    setLoading(true);
    setPreview(null);
    setNotPlayedTournaments([]);
    setSeasonFinalized(false);
    const [cacheResult, settingsResult] = await Promise.all([
      supabase
        .from('sheets_cache')
        .select('cache_key, type, synced_at, data')
        .in('cache_key', [...SEASON_HISTORY_CACHE_KEYS]),
      supabase
        .from('tournament_settings')
        .select('slug, enabled, finished'),
    ]);

    if (cacheResult.error) {
      toast.error('Não foi possível ler os caches da temporada: ' + cacheResult.error.message);
      setLoading(false);
      return;
    }

    const settings = (settingsResult.data ?? []) as TournamentSettingSnapshot[];
    const result = buildSeasonHistoryPreview(parsedSeason, (cacheResult.data ?? []) as any, settings);
    if (settingsResult.error) result.warnings.unshift('Não foi possível consultar as configurações dos torneios; a situação de habilitação/finalização precisa ser conferida manualmente.');
    setPreview(result);
    setLoading(false);
    toast.success('Prévia gerada. Nenhum dado foi gravado ou arquivado.');
  }, [season]);


  const archivePreview = useCallback(async () => {
    if (!preview) return;
    if (!seasonFinalized) {
      toast.error('Confirme que a temporada foi oficialmente encerrada antes de arquivar.');
      return;
    }
    if (unresolvedKnockouts.length > 0) {
      toast.error('Ainda existem torneios eliminatórios sem pódio confirmado. Resolva-os ou registre formalmente que não foram disputados antes de arquivar.');
      return;
    }
    if (preview.standings.length === 0 || preview.standings.some(row => row.totalPoints === null)) {
      toast.error('A classificação precisa ter equipes e pontuações válidas antes do arquivamento.');
      return;
    }

    const competitions = preview.tournaments
      .map(item => {
        const champion = item.podium.find(entry => entry.position === 1);
        const runnerUp = item.podium.find(entry => entry.position === 2);
        const third = item.podium.find(entry => entry.position === 3);
        return {
          slug: item.slug,
          name: item.name,
          source_provider: item.sourceProvider,
          source_format: item.sourceFormat,
          // Classificações auxiliares e torneios sem decisão completa permanecem pendentes.
          status: notPlayedTournaments.includes(item.slug) ? 'not_played' : item.kind === 'knockout' && item.status === 'complete' ? 'complete' : 'pending',
          champion_name: champion?.teamName ?? null,
          champion_badge_url: champion?.badgeUrl ?? null,
          runner_up_name: runnerUp?.teamName ?? null,
          runner_up_badge_url: runnerUp?.badgeUrl ?? null,
          third_place_name: third?.teamName ?? null,
          third_place_badge_url: third?.badgeUrl ?? null,
          final_score: { matches: item.finalMatches, podium: item.podium },
          source_snapshot: {
            selected: item.sourceSnapshot,
            alternates: item.alternateSnapshots,
            cache_key: item.sourceCacheKey,
            synced_at: item.sourceSyncedAt,
            warnings: item.warnings,
          },
        };
      });

    const pending = competitions.filter(item => item.status === 'pending').length;
    const notPlayed = competitions.filter(item => item.status === 'not_played').length;
    const message = [
      'CONFIRMAR ARQUIVAMENTO PERMANENTE?',
      '',
      `Temporada: ${preview.season}`,
      `Classificação: ${preview.standings.length} equipes`,
      `Torneios com fonte disponível: ${competitions.length}`,
      `Torneios que ficarão pendentes para conferência: ${pending}`,
      `Edições marcadas como não disputadas: ${notPlayed}`,
      '',
      'A operação não poderá ser repetida para esta liga/temporada.',
      'Os vínculos com perfis serão deixados em branco quando não houver identidade histórica comprovada.',
      '',
      'Deseja continuar?',
    ].join('\n');
    if (!window.confirm(message)) return;

    const typedConfirmation = window.prompt(
      `Para impedir um arquivamento acidental, digite exatamente: ARQUIVAR ${preview.season}`,
    );
    if (typedConfirmation !== `ARQUIVAR ${preview.season}`) {
      toast.info('Arquivamento cancelado. Nenhum dado foi gravado.');
      return;
    }

    setArchiving(true);
    try {
      const { data, error } = await supabase.rpc('archive_season_history', {
        p_payload: {
          league: 'liga-jacarandas',
          season: preview.season,
          summary: {
            generatedAt: preview.generatedAt,
            seasonFinalized,
            rankingSource: preview.rankingSource,
            rankingSnapshot: preview.rankingSnapshot,
            warnings: preview.warnings,
            archivedFrom: 'admin-season-history-preview',
          },
          standings: preview.standings.map(row => ({
            position: row.position,
            team_name: row.teamName,
            cartola_team_id: row.cartolaTeamId,
            badge_url: row.badgeUrl,
            total_points: row.totalPoints,
            source_snapshot: row.sourceSnapshot,
          })),
          competitions,
        },
      });

      if (error) {
        toast.error('Não foi possível arquivar: ' + error.message);
        return;
      }
      toast.success('Histórico arquivado permanentemente. ID: ' + String(data));
      setPreview(null);
    } catch (error) {
      toast.error('Falha inesperada ao arquivar: ' + (error instanceof Error ? error.message : 'erro desconhecido'));
    } finally {
      setArchiving(false);
    }
  }, [preview, unresolvedKnockouts.length, notPlayedTournaments, seasonFinalized]);

  const completeTournaments = preview?.tournaments.filter(item => item.kind === 'knockout' && item.status === 'complete').length ?? 0;
  const pendingTournaments = preview?.tournaments.filter(item => item.kind === 'knockout' && item.status === 'pending').length ?? 0;
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
            A coleta lê os caches sem alterá-los. Revise a classificação e os torneios; o arquivamento só ocorre após confirmação explícita.
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
              <h2 className="font-semibold">Fontes de classificação e torneios</h2>
              {preview.tournaments.map(tournament => (
                <Card key={tournament.slug}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-base">{tournament.name}</CardTitle>
                      <Badge variant={tournament.status === 'complete' ? 'default' : 'secondary'}>
                        {tournament.enabled === false && tournament.finished === false ? 'Confirmar se disputado' : tournament.finished && tournament.status !== 'complete' && tournament.kind === 'knockout' ? 'Finalizado — dados incompletos' : tournament.kind === 'standings' ? (tournament.standingsCount > 0 ? 'Classificação disponível' : 'Pendente') : tournament.status === 'complete' ? 'Pódio identificado' : tournament.status === 'pending' ? 'Pendente' : 'Sem cache'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tournament.sourceCacheKey ?? 'Fonte não encontrada'}
                      {tournament.sourceSyncedAt ? ` · ${new Date(tournament.sourceSyncedAt).toLocaleString('pt-BR')}` : ''}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {tournament.kind === 'standings' && tournament.standingsCount > 0 && <p className="text-sm text-muted-foreground">{tournament.standingsCount} equipes na classificação geral da série.</p>}
                    {tournament.kind === 'knockout' && tournament.podium.length > 0 && (
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
                    {tournament.kind === 'knockout' && tournament.status !== 'complete' && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant={notPlayedTournaments.includes(tournament.slug) ? 'secondary' : 'outline'}
                          onClick={() => setNotPlayedTournaments(current =>
                            current.includes(tournament.slug)
                              ? current.filter(slug => slug !== tournament.slug)
                              : [...current, tournament.slug]
                          )}
                        >
                          {notPlayedTournaments.includes(tournament.slug) ? 'Desfazer: edição não disputada' : 'Marcar edição como não disputada'}
                        </Button>
                        {notPlayedTournaments.includes(tournament.slug) && (
                          <Badge variant="outline">Será arquivado como não disputado</Badge>
                        )}
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
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground">Confrontos da fase final</p>
                        {tournament.finalMatches.map((match, index) => {
                          const ida1 = match.scoreIda1 ?? match.score1 ?? '—';
                          const ida2 = match.scoreIda2 ?? match.score2 ?? '—';
                          const volta1 = match.scoreVolta1;
                          const volta2 = match.scoreVolta2;
                          const hasReturnLeg = String(volta1 ?? '').trim() !== '' || String(volta2 ?? '').trim() !== '';
                          return (
                            <div key={index} className="rounded-md border p-3 text-sm space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-medium">{match.matchNumber ?? match.tipo ?? `Confronto ${index + 1}`}</span>
                                {match.manualWinner && <Badge variant="outline">Decisão manual: {match.manualWinner}</Badge>}
                              </div>
                              <p>{match.team1 || 'Equipe a definir'} <span className="font-semibold tabular-nums">{ida1} × {ida2}</span> {match.team2 || 'Equipe a definir'}</p>
                              {hasReturnLeg && <p className="text-xs text-muted-foreground">Volta: {volta1 || '—'} × {volta2 || '—'}</p>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </section>

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                O arquivamento é definitivo. Como a temporada 2026 ainda está em andamento, não faça esta confirmação agora.
                Ela só deve ser marcada depois do encerramento oficial e da conferência de todos os resultados.
              </AlertDescription>
            </Alert>
            <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={seasonFinalized}
                onChange={event => setSeasonFinalized(event.target.checked)}
                disabled={archiving}
              />
              <span>Confirmo que a temporada {preview.season} foi oficialmente encerrada e que a classificação anual e os torneios foram revisados.</span>
            </label>
            {unresolvedKnockouts.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  O arquivamento está bloqueado: {unresolvedKnockouts.length} torneio(s) eliminatório(s) ainda não têm pódio confirmado
                  ({unresolvedKnockouts.map(item => item.name).join(', ')}). Antes de fechar a temporada, será necessário atualizar os resultados
                  ou marcá-la explicitamente como não disputada na própria revisão.
                </AlertDescription>
              </Alert>
            )}
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Revisão final: o arquivamento grava uma cópia imutável da classificação e dos snapshots disponíveis.
                Torneios sem resultado decisivo ficam pendentes, a menos que você os marque como não disputados; fontes auxiliares de Série A/B/C não geram campeões.
                Nenhum perfil será associado automaticamente. A confirmação é permanente e protegida contra duplicidade.
              </AlertDescription>
            </Alert>
            <Button className="w-full" variant="destructive" onClick={() => void archivePreview()} disabled={archiving || loading || !seasonFinalized || preview.standings.length === 0 || unresolvedKnockouts.length > 0}>
              {archiving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
              {archiving ? 'Arquivando temporada...' : 'Confirmar arquivamento permanente'}
            </Button>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default AdminSeasonHistory;
