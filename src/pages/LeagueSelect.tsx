import { useNavigate } from 'react-router-dom';
import { Trophy, Globe } from 'lucide-react';
import { useAppLeague, type AppLeague } from '@/contexts/AppLeagueContext';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface LeagueOption {
  id: AppLeague;
  title: string;
  subtitle: string;
  icon: typeof Trophy;
  disabled?: boolean;
}

const LEAGUES: LeagueOption[] = [
  { id: 'brasileirao', title: 'Brasileirão', subtitle: 'Séries A, B, C, Copas e Continentais', icon: Trophy },
  { id: 'campeoes', title: 'Champions League', subtitle: 'Fase de Liga e Mata-mata', icon: Trophy },
  { id: 'copa_mundo', title: 'Copa do Mundo', subtitle: 'Fase de grupos e mata-mata', icon: Globe },
];

const LeagueSelect = () => {
  const navigate = useNavigate();
  const { setLeague } = useAppLeague();

  const handleSelect = (id: AppLeague) => {
    setLeague(id);
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Escolha sua competição</h1>
          <p className="text-sm text-muted-foreground">
            Você pode trocar a qualquer momento no perfil.
          </p>
        </div>

        <div className="space-y-3">
          {LEAGUES.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                disabled={opt.disabled}
                onClick={() => !opt.disabled && handleSelect(opt.id)}
                className={cn(
                  'w-full text-left',
                  opt.disabled && 'cursor-not-allowed',
                )}
              >
                <Card className={cn(
                  'border-border transition-colors',
                  opt.disabled
                    ? 'opacity-50'
                    : 'hover:border-primary/60 hover:bg-card/80',
                )}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-semibold text-foreground">{opt.title}</p>
                      <p className="text-xs text-muted-foreground">{opt.subtitle}</p>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LeagueSelect;
