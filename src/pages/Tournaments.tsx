import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Trophy, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAppLeague } from '@/contexts/AppLeagueContext';
import { LEAGUE_SLUGS } from '@/config/leagueSlugs';

const tournaments = [
  { name: 'BRASILEIRÃO Série A', slug: 'brasileirao-serie-a' },
  { name: 'BRASILEIRÃO Série B', slug: 'brasileirao-serie-b' },
  { name: 'BRASILEIRÃO Série C', slug: 'brasileirao-serie-c' },
  { name: 'COPA DO BRASIL', slug: 'copa-do-brasil' },
  { name: 'LIBERTADORES', slug: 'libertadores' },
  { name: 'SULAMERICANA', slug: 'sulamericana' },
  { name: 'COPA INTERCONTINENTAL', slug: 'copa-intercontinental' },
  { name: 'CHAMPIONS LEAGUE', slug: 'champions-league' },
  { name: 'COPA DO MUNDO FIFA', slug: 'copa-do-mundo' },
];

const Tournaments = () => {
  const navigate = useNavigate();
  const { league } = useAppLeague();
  const [settingsMap, setSettingsMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('tournament_settings').select('slug, enabled');
      if (data) {
        const map: Record<string, boolean> = {};
        data.forEach((row: any) => { map[row.slug] = row.enabled; });
        setSettingsMap(map);
      }
    };
    fetch();
  }, []);

  // Guard: aguarda contexto hidratar
  if (!league) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">
        Carregando...
      </div>
    );
  }

  const allowedSlugs = LEAGUE_SLUGS[league];
  const visibleTournaments = tournaments.filter(t => allowedSlugs.includes(t.slug));

  return (
    <AppLayout>
      <div className="p-4">
        <div className="flex items-center gap-3 mb-6">
          <Trophy className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Torneios</h1>
        </div>

        <div className="space-y-3">
          {visibleTournaments.map((t) => {
            const isEnabled = settingsMap[t.slug] !== false;
            return (
              <button
                key={t.slug}
                disabled={!isEnabled}
                onClick={isEnabled ? () => navigate(`/tournaments/${t.slug}`) : undefined}
                className={`w-full flex items-center justify-between p-4 rounded-lg bg-card border border-border transition-colors text-left ${
                  isEnabled ? 'hover:border-primary/50' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Trophy className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-sm font-semibold text-foreground">{t.name}</span>
                </div>
                {isEnabled ? (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <span className="text-xs text-muted-foreground">Em Breve</span>
                )}
              </button>
            );
          })}

          {visibleTournaments.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">
              Nenhum torneio disponível para esta competição.
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Tournaments;
