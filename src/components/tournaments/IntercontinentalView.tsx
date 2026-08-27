import { useTournamentFinished } from '@/hooks/useTournamentFinished';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Loader2, AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useDadosExternosIntercontinental,
  useConfrontosIntercontinental,
} from '@/hooks/useGoogleSheets';
import CupMatchCard from './CupMatchCard';
import { buildTeamIdMap } from '@/utils/matchComparison';
import { useUserTeamIds, buildIsUserTeamById } from '@/hooks/useUserTeamIds';
import { useUserTeamNames } from '@/hooks/useUserTeamNames';

const FASES = ['Quartas de Final', 'Semifinal', 'Final'];

const normalizeName = (n: string) =>
  n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

interface IntercontinentalViewProps {
  isUserTeam?: (name: string) => boolean;
  rodadaBase?: number;
  statusMercado?: number;
  slug?: string;
  initialFase?: string;
}

const IntercontinentalView = ({ isUserTeam, rodadaBase, statusMercado, slug, initialFase }: IntercontinentalViewProps) => {
  const { finished } = useTournamentFinished(slug);
  const navigate = useNavigate();
  const [fase, setFase] = useState(() => initialFase && FASES.includes(initialFase) ? initialFase : FASES[0]);

  const { data: dadosExternos } = useDadosExternosIntercontinental();
  const { data: knockoutData, isLoading, error } = useConfrontosIntercontinental(fase);

  const badgeUrls = useMemo(() => {
    if (!dadosExternos?.rows) return {};
    const mapping: Record<string, string> = {};
    for (const row of dadosExternos.rows) {
      const name = row[0]?.trim();
      const url = row[2]?.trim();
      if (name && url && url.startsWith('http')) {
        mapping[name] = url;
        mapping[name.toUpperCase()] = url;
        mapping[name.toLowerCase()] = url;
        mapping[normalizeName(name)] = url;
      }
    }
    return mapping;
  }, [dadosExternos]);

  const teamNameToId = useMemo(() => {
    if (!dadosExternos?.rows) return new Map<string, string>();
    return buildTeamIdMap(dadosExternos.rows);
  }, [dadosExternos]);

  const handleMatchClick = (id1: string, id2: string) => {
    if (!rodadaBase || !statusMercado) return;
    const rodada = statusMercado === 1 ? rodadaBase - 1 : rodadaBase;
    if (rodada < 1) return;
    const params = new URLSearchParams({
      id1,
      id2,
      rodada: String(rodada),
      statusMercado: String(statusMercado),
      tab: 'confrontos',
      fase,
    });
    if (slug) params.set('slug', slug);
    navigate(`/match-comparison?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Trophy className="w-4 h-4 text-primary flex-shrink-0" />
        <Select value={fase} onValueChange={(v) => { if (FASES.includes(v)) setFase(v); }}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Selecione a fase" />
          </SelectTrigger>
          <SelectContent>
            {FASES.map(f => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando confrontos...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
          <p className="text-sm text-destructive">Erro: {error.message}</p>
        </div>
      )}

      {!isLoading && !error && knockoutData && (
        <div className="space-y-2">
          {knockoutData.rodadaInfo && (
            <div className="text-center mb-2">
              <p className="text-xs text-muted-foreground">{knockoutData.rodadaInfo}</p>
            </div>
          )}

          {knockoutData.matches.length > 0 ? (
            knockoutData.matches.map((match, idx) => {
              const id1 = teamNameToId.get(match.team1?.toUpperCase());
              const id2 = teamNameToId.get(match.team2?.toUpperCase());
              const hasIds = !!id1 && !!id2;
              const isEnabled = hasIds && !!rodadaBase && !!statusMercado;
              return (
                <CupMatchCard key={`${match.matchNumber}-${idx}`} match={match} badgeUrls={badgeUrls} isFinal isUserTeam={isUserTeam}
                  disabled={!isEnabled}
                  onMatchClick={hasIds ? () => handleMatchClick(id1!, id2!) : undefined}
                />
              );
            })
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhum confronto encontrado para esta fase.
            </p>
          )}

          {finished && knockoutData.podium && knockoutData.podium.some(p => p.team) && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <h3 className="text-sm font-bold text-foreground">Premiação</h3>
              </div>
              {knockoutData.podium.map((entry) => {
                const isChamp = entry.position === 1;
                return (
                  <div key={entry.position}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${isChamp ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-card border-border'}`}>
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                      entry.position === 1 ? 'bg-yellow-500 text-yellow-950' :
                      entry.position === 2 ? 'bg-gray-300 text-gray-800' : 'bg-amber-700 text-amber-100'
                    }`}>
                      {entry.position}º
                    </div>
                    {entry.badge && (
                      <img src={entry.badge} alt={entry.team} className={`object-contain ${isChamp ? 'w-10 h-10' : 'w-8 h-8'}`}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <span className={`font-semibold ${isChamp ? 'text-base text-foreground' : 'text-sm text-muted-foreground'}`}>
                      {entry.team}
                    </span>
                    {isChamp && <Trophy className="w-4 h-4 text-yellow-500 ml-auto" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default IntercontinentalView;
