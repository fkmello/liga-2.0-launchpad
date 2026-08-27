import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Trophy } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const tournamentsList = [
  { slug: 'brasileirao-serie-a', name: 'BRASILEIRÃO Série A' },
  { slug: 'brasileirao-serie-b', name: 'BRASILEIRÃO Série B' },
  { slug: 'brasileirao-serie-c', name: 'BRASILEIRÃO Série C' },
  { slug: 'copa-do-brasil', name: 'COPA DO BRASIL' },
  { slug: 'libertadores', name: 'LIBERTADORES' },
  { slug: 'sulamericana', name: 'SULAMERICANA' },
  { slug: 'copa-intercontinental', name: 'COPA INTERCONTINENTAL' },
  { slug: 'champions-league', name: 'CHAMPIONS LEAGUE' },
  { slug: 'copa-do-mundo', name: 'COPA DO MUNDO FIFA' },
];

interface Settings {
  enabled: boolean;
  finished: boolean;
}

const AdminTournaments = () => {
  const [settings, setSettings] = useState<Record<string, Settings>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('tournament_settings').select('slug, enabled, finished');
      if (data) {
        const map: Record<string, Settings> = {};
        data.forEach((row: any) => { map[row.slug] = { enabled: !!row.enabled, finished: !!row.finished }; });
        setSettings(map);
      }
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const update = async (slug: string, patch: Partial<Settings>) => {
    const prev = settings[slug] ?? { enabled: true, finished: false };
    const next = { ...prev, ...patch };
    setSettings(s => ({ ...s, [slug]: next }));
    const { error } = await supabase
      .from('tournament_settings')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('slug', slug);
    if (error) {
      setSettings(s => ({ ...s, [slug]: prev }));
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <AppLayout>
      <div className="p-4">
        <div className="flex items-center gap-3 mb-6">
          <Trophy className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Gerenciar Torneios</h1>
        </div>

        <div className="space-y-3">
          {tournamentsList.map((t) => {
            const s = settings[t.slug] ?? { enabled: true, finished: false };
            return (
              <div
                key={t.slug}
                className="flex items-center justify-between gap-3 p-4 rounded-lg bg-card border border-border"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Trophy className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-sm font-semibold text-foreground truncate">{t.name}</span>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`enabled-${t.slug}`} className="text-[11px] text-muted-foreground uppercase tracking-wide">Ativo</Label>
                    <Switch
                      id={`enabled-${t.slug}`}
                      checked={s.enabled}
                      onCheckedChange={(v) => update(t.slug, { enabled: v })}
                      disabled={loading}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`finished-${t.slug}`} className="text-[11px] text-muted-foreground uppercase tracking-wide">Finalizado</Label>
                    <Switch
                      id={`finished-${t.slug}`}
                      checked={s.finished}
                      onCheckedChange={(v) => update(t.slug, { finished: v })}
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
};

export default AdminTournaments;
