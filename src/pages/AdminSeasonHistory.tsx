import { useCallback, useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Archive, CalendarDays, Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type ArchiveRow = {
  id: string;
  league: string;
  season: number;
  status: 'draft' | 'archived';
  archived_at: string | null;
  created_at: string;
};

const SeasonHistoryAdmin = () => {
  const [archives, setArchives] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [season, setSeason] = useState(String(new Date().getFullYear()));

  const loadArchives = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('season_archives')
      .select('id, league, season, status, archived_at, created_at')
      .order('season', { ascending: false });
    if (error) toast.error('Não foi possível carregar o histórico: ' + error.message);
    else setArchives((data ?? []) as ArchiveRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadArchives(); }, [loadArchives]);

  const createDraft = async () => {
    const parsedSeason = Number(season);
    if (!Number.isInteger(parsedSeason) || parsedSeason < 2000 || parsedSeason > 2200) {
      toast.error('Informe uma temporada válida.');
      return;
    }
    setCreating(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
      .from('season_archives')
      .insert({
        league: 'brasileirao',
        season: parsedSeason,
        status: 'draft',
        created_by: userData.user?.id ?? null,
      })
      .select('id')
      .single();

    if (error) {
      toast.error(error.code === '23505' ? 'Já existe um arquivo para essa temporada.' : 'Não foi possível criar o rascunho: ' + error.message);
      setCreating(false);
      return;
    }

    await (supabase as any).from('season_archive_events').insert({
      archive_id: data.id,
      actor_id: userData.user?.id,
      event_type: 'created',
      details: { league: 'brasileirao', season: parsedSeason },
    });
    toast.success('Rascunho da temporada criado.');
    await loadArchives();
    setCreating(false);
  };

  return (
    <AppLayout>
      <div className="p-4 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Administração</p>
            <h1 className="text-2xl font-bold">Histórico de temporadas</h1>
          </div>
          <Button variant="outline" size="icon" onClick={() => void loadArchives()} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" /> Preparar uma temporada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cria somente um rascunho vazio. Nenhum ranking, torneio ou resultado é copiado até a etapa de revisão e arquivamento.
            </p>
            <div className="space-y-2">
              <Label htmlFor="archive-season">Temporada</Label>
              <Input id="archive-season" inputMode="numeric" value={season} onChange={e => setSeason(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => void createDraft()} disabled={creating}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
              Criar rascunho
            </Button>
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h2 className="font-semibold">Temporadas cadastradas</h2>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : archives.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhuma temporada preparada ainda.</CardContent></Card>
          ) : archives.map(item => (
            <Card key={item.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-semibold">{item.season}</p>
                    <p className="text-xs text-muted-foreground">Liga Jacarandás</p>
                  </div>
                </div>
                <Badge variant={item.status === 'archived' ? 'default' : 'secondary'}>
                  {item.status === 'archived' ? 'Arquivada' : 'Rascunho'}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </AppLayout>
  );
};

export default SeasonHistoryAdmin;
