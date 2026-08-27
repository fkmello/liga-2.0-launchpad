import { useTournamentFinished } from '@/hooks/useTournamentFinished';
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Loader2, AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfrontosCopa, useBaseDadosCopa } from '@/hooks/useGoogleSheets';
import CupMatchCard from './CupMatchCard';
import { buildTeamIdMap } from '@/utils/matchComparison';
import { buildCartolaUrl } from '@/config/cartolaEndpoint';
import { useUserTeamIds, buildIsUserTeamById } from '@/hooks/useUserTeamIds';
import { useUserTeamNames } from '@/hooks/useUserTeamNames';

const COPA_BRASIL_LEAGUE = 'copa_brasil';

const FASES = [
  '1ª Fase',
  '2ª Fase',
  'Oitavas de Final',
  'Quartas de Final',
  'Semifinal',
  'Final',
];

const CUP_ALLOWED_ROUNDS: Record<string, { open: number[]; closed: number[] }> = {
  '1ª Fase':          { open: [6, 8],    closed: [5, 7] },
  '2ª Fase':          { open: [14, 17],  closed: [13, 16] },
  'Oitavas de Final': { open: [22, 23],  closed: [21, 22] },
  'Quartas de Final': { open: [26, 27],  closed: [25, 26] },
  'Semifinal':        { open: [35, 36],  closed: [34, 35] },
  'Final':            { open: [],        closed: [38] },
};

const isCupClickable = (fase: string, rodadaBase?: number, statusMercado?: number): boolean => {
  if (!rodadaBase || !statusMercado) return false;
  const allowed = CUP_ALLOWED_ROUNDS[fase];
  if (!allowed) return false;
  const rounds = statusMercado === 1 ? allowed.open : allowed.closed;
  return rounds.includes(rodadaBase);
};

interface CupRoundMatchesProps {
  isUserTeam?: (name: string) => boolean;
  rodadaBase?: number;
  statusMercado?: number;
  slug?: string;
  initialFase?: string;
}

const getFaseInicial = (rodada?: number): string => {
  if (!rodada || rodada <= 7) return '1ª Fase';
  if (rodada <= 16) return '2ª Fase';
  if (rodada <= 22) return 'Oitavas de Final';
  if (rodada <= 26) return 'Quartas de Final';
  if (rodada <= 35) return 'Semifinal';
  return 'Final';
};

const CupRoundMatches = ({ isUserTeam: _isUserTeamProp, rodadaBase, statusMercado, slug, initialFase }: CupRoundMatchesProps) => {
  const { finished } = useTournamentFinished(slug);
  const navigate = useNavigate();
  const userIds = useUserTeamIds();
  const { teamNames: userTeamNames } = useUserTeamNames();
  const hasInitialFaseFromUrl = !!initialFase && FASES.includes(initialFase);
  const [fase, setFase] = useState(() => hasInitialFaseFromUrl ? initialFase : getFaseInicial(rodadaBase));
  const [userChanged, setUserChanged] = useState(false);

  // Sync phase when rodadaBase loads asynchronously
  useEffect(() => {
    if (rodadaBase && !userChanged && !hasInitialFaseFromUrl) {
      setFase(getFaseInicial(rodadaBase));
    }
  }, [rodadaBase, userChanged, hasInitialFaseFromUrl]);

  const { data, isLoading, error } = useConfrontosCopa(fase);
  const { data: dadosExternos } = useBaseDadosCopa(fase);

  const badgeUrls = useMemo(() => {
    if (!dadosExternos?.rows) return {};
    const mapping: Record<string, string> = {};
    const normalizeName = (n: string) =>
      n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
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

  const isUserTeam = useMemo(
    () => buildIsUserTeamById(teamNameToId, userIds, userTeamNames),
    [teamNameToId, userIds, userTeamNames],
  );

  // Determine which leg is live based on current round
  const activeLeg = useMemo<'ida' | 'volta' | null>(() => {
    if (!rodadaBase || statusMercado !== 2) return null;
    const allowed = CUP_ALLOWED_ROUNDS[fase];
    if (!allowed) return null;
    if (rodadaBase === allowed.closed[0]) return 'ida';
    if (rodadaBase === allowed.closed[1]) return 'volta';
    return null;
  }, [rodadaBase, statusMercado, fase]);

  // Collect unique team IDs for partial scores fetch
  const partialIds = useMemo(() => {
    if (!activeLeg || !data?.matches) return '';
    const seen = new Set<string>();
    for (const m of data.matches) {
      const id1 = teamNameToId.get(m.team1?.toUpperCase());
      const id2 = teamNameToId.get(m.team2?.toUpperCase());
      if (id1) seen.add(id1);
      if (id2) seen.add(id2);
    }
    return Array.from(seen).sort().join(',');
  }, [activeLeg, data?.matches, teamNameToId]);

  // Fetch partial scores. Resolve league: prefer per-match league when present.
  const resolvedLeague = useMemo(() => {
    const fromData = data?.matches?.find(m => (m as { league?: string }).league)?.league;
    return fromData ?? COPA_BRASIL_LEAGUE;
  }, [data?.matches]);

  const { data: partialData } = useQuery({
    queryKey: ['cup-partial-scores', fase, rodadaBase, partialIds, resolvedLeague],
    queryFn: async () => {
      const url = buildCartolaUrl(
        { action: 'batch_lineups', ids: partialIds, rodada: rodadaBase },
        resolvedLeague,
      );
      const res = await fetch(url, {
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error(`batch_lineups failed: ${res.status}`);
      return await res.json() as {
        scores: Record<string, number | null>;
        playedCounts: Record<string, number>;
      };
    },
    enabled: !!activeLeg && partialIds.length > 0,
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  const partialScores = useMemo(() => {
    const scores = new Map<string, number>();
    const played = new Map<string, number>();
    if (partialData) {
      for (const [id, s] of Object.entries(partialData.scores)) {
        if (s !== null && s !== undefined) scores.set(id, s);
      }
      for (const [id, c] of Object.entries(partialData.playedCounts)) {
        played.set(id, c);
      }
    }
    return { scores, played };
  }, [partialData]);

  const handleMatchClick = (id1: string, id2: string) => {
    if (!rodadaBase || !statusMercado) return;
    const rodadaComparison = statusMercado === 1 ? rodadaBase - 1 : rodadaBase;
    if (rodadaComparison < 1) return;
    const params = new URLSearchParams({
      id1,
      id2,
      rodada: String(rodadaComparison),
      statusMercado: String(statusMercado),
      tab: 'confrontos',
      fase,
    });
    if (slug) params.set('slug', slug);
    navigate(`/match-comparison?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Phase selector */}
      <div className="flex items-center gap-3">
        <Trophy className="w-4 h-4 text-primary flex-shrink-0" />
        <Select value={fase} onValueChange={(v) => { if (!FASES.includes(v)) return; setUserChanged(true); setFase(v); }}>
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

      {data?.rodadaInfo && (
        <div className="text-center">
          <p className="text-xs text-muted-foreground">{data.rodadaInfo}</p>
        </div>
      )}

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

      {!isLoading && !error && data?.matches && (
        <div className="space-y-2">
          {data.matches.length > 0 ? (
            data.matches.map((match, idx) => {
              const id1 = teamNameToId.get(match.team1?.toUpperCase());
              const id2 = teamNameToId.get(match.team2?.toUpperCase());
              const hasIds = !!id1 && !!id2;
              const isEnabled = hasIds && isCupClickable(fase, rodadaBase, statusMercado);

              // Get partial scores and played counts for this match
              const ps1 = id1 ? partialScores.scores.get(id1) : undefined;
              const ps2 = id2 ? partialScores.scores.get(id2) : undefined;
              const pc1 = id1 ? partialScores.played.get(id1) : undefined;
              const pc2 = id2 ? partialScores.played.get(id2) : undefined;

              return (
                <CupMatchCard
                  key={`${match.matchNumber}-${idx}`}
                  match={match}
                  badgeUrls={badgeUrls}
                  isFinal={data?.isFinal}
                  isUserTeam={isUserTeam}
                  disabled={!isEnabled}
                  onMatchClick={hasIds ? () => handleMatchClick(id1!, id2!) : undefined}
                  activeLeg={activeLeg}
                  partialScore1={ps1}
                  partialScore2={ps2}
                  playedCount1={pc1}
                  playedCount2={pc2}
                />
              );
            })
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhum confronto encontrado para esta fase.
            </p>
          )}

          {/* Podium */}
          {finished && data.podium && data.podium.some(p => p.team) && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <h3 className="text-sm font-bold text-foreground">Premiação</h3>
              </div>
              {data.podium.map((entry) => {
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

export default CupRoundMatches;
