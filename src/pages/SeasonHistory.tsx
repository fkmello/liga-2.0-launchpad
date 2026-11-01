import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Archive, CalendarDays, Loader2, Trophy, Medal, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

type ArchiveRow = { id: string; league: string; season: number; archived_at: string; summary: Record<string, any> };
type StandingRow = { id: string; position: number; team_name: string; manager_name: string | null; badge_url: string | null; total_points: number };
type CompetitionRow = {
  id: string; tournament_slug: string; tournament_name: string; status: 'pending' | 'complete' | 'not_played';
  champion_name: string | null; champion_badge_url: string | null; runner_up_name: string | null;
  runner_up_badge_url: string | null; third_place_name: string | null; third_place_badge_url: string | null;
  final_score: Record<string, any>;
};

const SeasonHistory = () => {
  const [archives, setArchives] = useState<ArchiveRow[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const loadArchives = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: queryError } = await (supabase as any)
      .from('season_archives')
      .select('id, league, season, archived_at, summary')
      .eq('status', 'archived')
      .eq('league', 'liga-jacarandas')
      .order('season', { ascending: false });
    if (queryError) {
      setError('Não foi possível carregar o histórico. Tente novamente mais tarde.');
      setArchives([]);
    } else {
      const rows = (data ?? []) as ArchiveRow[];
      setArchives(rows);
      setSelectedId(current => rows.some(row => row.id === current) ? current : rows[0]?.id ?? '');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadArchives(); }, [loadArchives]);

  useEffect(() => {
    if (!selectedId) { setStandings([]); setCompetitions([]); return; }
    let active = true;
    const loadDetails = async () => {
      setDetailLoading(true);
      const [standingResult, competitionResult] = await Promise.all([
        (supabase as any).from('season_archive_standings')
          .select('id, position, team_name, manager_name, badge_url, total_points')
          .eq('archive_id', selectedId).order('position', { ascending: true }),
        (supabase as any).from('season_archive_competitions')
          .select('id, tournament_slug, tournament_name, status, champion_name, champion_badge_url, runner_up_name, runner_up_badge_url, third_place_name, third_place_badge_url, final_score')
          .eq('archive_id', selectedId).order('tournament_name', { ascending: true }),
      ]);
      if (!active) return;
      if (standingResult.error || competitionResult.error) {
        setError('Não foi possível carregar os detalhes desta temporada.');
        setStandings([]);
        setCompetitions([]);
      } else {
        setError('');
        setStandings((standingResult.data ?? []) as StandingRow[]);
        setCompetitions((competitionResult.data ?? []) as CompetitionRow[]);
      }
      setDetailLoading(false);
    };
    void loadDetails();
    return () => { active = false; };
  }, [selectedId]);

  const selected = useMemo(() => archives.find(row => row.id === selectedId) ?? null, [archives, selectedId]);
  const formatPoints = (value: number) => Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const statusLabel = (status: CompetitionRow['status']) => status === 'complete' ? 'Concluído' : status === 'not_played' ? 'Não disputado' : 'Pendente';

  return (
    <AppLayout>
      <div className="p-4 space-y-5">
        <header className="flex items-center gap-3">
          <Archive className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">História da Liga</h1>
            <p className="text-sm text-muted-foreground">Temporadas arquivadas da Liga Jacarandás</p>
          </div>
        </header>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : error && archives.length === 0 ? (
          <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>
        ) : archives.length === 0 ? (
          <Card><CardContent className="py-10 text-center space-y-2">
            <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="font-semibold">Ainda não há temporadas arquivadas</p>
            <p className="text-sm text-muted-foreground">Quando uma temporada for oficialmente encerrada e arquivada pela administração, ela aparecerá aqui.</p>
          </CardContent></Card>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Temporada</label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger><SelectValue placeholder="Escolha uma temporada" /></SelectTrigger>
                <SelectContent>{archives.map(row => <SelectItem key={row.id} value={row.id}>{row.season}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
            {detailLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : selected && (
              <>
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Medal className="h-5 w-5 text-primary" /> Classificação final — {selected.season}</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {standings.map(row => (
                      <div key={row.id} className="flex items-center gap-3 rounded-lg border p-2">
                        <span className="w-7 text-center font-bold text-muted-foreground">{row.position}º</span>
                        {row.badge_url ? <img src={row.badge_url} alt="" className="h-8 w-8 object-contain" loading="lazy" /> : <div className="h-8 w-8 rounded-full bg-muted" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{row.team_name}</p>
                          {row.manager_name && <p className="truncate text-xs text-muted-foreground">{row.manager_name}</p>}
                        </div>
                        <span className="text-sm font-semibold tabular-nums">{formatPoints(row.total_points)}</span>
                      </div>
                    ))}
                    {standings.length === 0 && <p className="text-sm text-muted-foreground">Classificação não disponível neste arquivo.</p>}
                  </CardContent>
                </Card>

                <section className="space-y-3">
                  <div className="flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" /><h2 className="font-bold">Campeões e torneios</h2></div>
                  {competitions.map(item => (
                    <Card key={item.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-base">{item.tournament_name}</CardTitle>
                          <Badge variant={item.status === 'complete' ? 'default' : 'secondary'}>{statusLabel(item.status)}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {item.status === 'complete' ? (
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {[{ label: 'Campeão', name: item.champion_name, badge: item.champion_badge_url }, { label: 'Vice', name: item.runner_up_name, badge: item.runner_up_badge_url }, { label: 'Terceiro', name: item.third_place_name, badge: item.third_place_badge_url }].filter(entry => entry.name).map(entry => (
                              <div key={entry.label} className="flex items-center gap-2">
                                {entry.badge ? <img src={entry.badge} alt="" className="h-9 w-9 object-contain" loading="lazy" /> : <div className="h-9 w-9 rounded-full bg-muted" />}
                                <div><p className="text-[11px] text-muted-foreground">{entry.label}</p><p className="text-sm font-semibold">{entry.name}</p></div>
                              </div>
                            ))}
                          </div>
                        ) : <p className="text-sm text-muted-foreground">{item.status === 'not_played' ? 'Esta edição não foi disputada nesta temporada.' : 'Resultado não confirmado no momento do arquivamento.'}</p>}
                      </CardContent>
                    </Card>
                  ))}
                  {competitions.length === 0 && <p className="text-sm text-muted-foreground">Nenhum torneio registrado nesta temporada.</p>}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default SeasonHistory;
