import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Trophy, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfrontos, useDadosExternos } from '@/hooks/useGoogleSheets';
import { usePartialScores } from '@/hooks/usePartialScores';
import MatchCard from './MatchCard';
import { canCompare, buildTeamIdMap } from '@/utils/matchComparison';

interface RoundMatchesProps {
  league?: string;
  isUserTeam?: (name: string) => boolean;
  rodadaAtual?: number;
  rodadaBase?: number;
  statusMercado?: number;
  slug?: string;
}

const RoundMatches = ({ league = 'serie_a', isUserTeam, rodadaAtual, rodadaBase, statusMercado, slug }: RoundMatchesProps) => {
  const navigate = useNavigate();
  const [rodada, setRodada] = useState(() => rodadaAtual ?? 1);

  useEffect(() => {
    if (rodadaAtual) {
      setRodada(rodadaAtual);
    }
  }, [rodadaAtual]);

  const { data: confrontosData, isLoading, error } = useConfrontos(rodada, league);
  const { data: dadosExternos } = useDadosExternos(league);

  // Build badge URL mapping
  const badgeUrls = useMemo(() => {
    if (!dadosExternos?.rows) return {};
    const mapping: Record<string, string> = {};
    for (const row of dadosExternos.rows) {
      const name = row[0]?.trim();
      const url = row[3]?.trim();
      if (name && url && url.startsWith('http')) {
        mapping[name] = url;
        mapping[name.toUpperCase()] = url;
      }
    }
    return mapping;
  }, [dadosExternos]);

  // Build teamName -> idCartola map
  const teamNameToId = useMemo(() => {
    if (!dadosExternos?.rows) return new Map<string, string>();
    return buildTeamIdMap(dadosExternos.rows);
  }, [dadosExternos]);

  // Prioridade: dado (match.league) > componente (league prop) > default
  const resolvedLeague = useMemo(() => {
    return confrontosData?.matches?.find(m => m.league)?.league ?? league;
  }, [confrontosData?.matches, league]);

  const { scores: partialScores, playedCounts } = usePartialScores(
    confrontosData?.matches,
    teamNameToId,
    rodada,
    rodadaBase,
    statusMercado,
    undefined,
    resolvedLeague,
  );

  const handlePrev = () => setRodada(r => Math.max(1, r - 1));
  const handleNext = () => setRodada(r => Math.min(38, r + 1));

  const handleMatchClick = (id1: string, id2: string) => {
    const params = new URLSearchParams({
      id1,
      id2,
      rodada: String(rodada),
      tab: 'confrontos',
    });
    if (statusMercado != null) params.set('statusMercado', String(statusMercado));
    if (slug) params.set('slug', slug);
    navigate(`/match-comparison?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Round selector */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={handlePrev} disabled={rodada <= 1} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            Rodada {rodada.toString().padStart(2, '0')}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleNext} disabled={rodada >= 38} className="text-muted-foreground hover:text-foreground">
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Tournament title */}
      {confrontosData?.tournament && (
        <div className="text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {confrontosData.tournament}
          </p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando confrontos...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
          <p className="text-sm text-destructive">Erro ao carregar confrontos: {error.message}</p>
        </div>
      )}

      {/* Matches */}
      {!isLoading && !error && confrontosData?.matches && (
        <div className="space-y-2">
          {confrontosData.matches.length > 0 ? (
            confrontosData.matches.map((match, idx) => {
              const id1 = teamNameToId.get(match.team1.toUpperCase());
              const id2 = teamNameToId.get(match.team2.toUpperCase());
              const isEnabled = rodadaBase != null && statusMercado != null
                ? canCompare(rodada, rodadaBase, statusMercado)
                : false;
              const hasIds = !!id1 && !!id2;

              const ps1 = id1 ? partialScores.get(id1) : undefined;
              const ps2 = id2 ? partialScores.get(id2) : undefined;
              const pc1 = id1 ? playedCounts.get(id1) : undefined;
              const pc2 = id2 ? playedCounts.get(id2) : undefined;

              return (
                <MatchCard
                  key={`${match.team1}-${match.team2}-${idx}`}
                  match={match}
                  badgeUrls={badgeUrls}
                  isUserTeam={isUserTeam}
                  disabled={!isEnabled || !hasIds}
                  onMatchClick={hasIds ? () => handleMatchClick(id1!, id2!) : undefined}
                  partialScore1={ps1}
                  partialScore2={ps2}
                  playedCount1={pc1}
                  playedCount2={pc2}
                />
              );
            })
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhum confronto encontrado para esta rodada.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default RoundMatches;
