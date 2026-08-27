import { useQuery } from '@tanstack/react-query';
import { Confronto } from '@/hooks/useGoogleSheets';
import { buildCartolaUrl } from '@/config/cartolaEndpoint';

interface PartialScoresResult {
  scores: Map<string, number>;
  playedCounts: Map<string, number>;
}

export function usePartialScores(
  matches: Confronto[] | undefined,
  teamNameToId: Map<string, string>,
  rodadaSelecionada: number,
  rodadaAtual: number | undefined,
  statusMercado: number | undefined,
  enableOverride?: boolean,
  league?: string,
): PartialScoresResult {
  const enabled = enableOverride !== undefined
    ? enableOverride
    : (rodadaSelecionada === rodadaAtual && statusMercado === 2);

  // Collect unique IDs. Resolve league per-match: data wins, fallback to component-level.
  const ids: string[] = [];
  let resolvedLeague: string | undefined = league;
  if (enabled && matches) {
    const seen = new Set<string>();
    for (const m of matches) {
      // Prioridade: dado (m.league) > componente (league) > default
      if (m.league) resolvedLeague = m.league;
      const id1 = teamNameToId.get(m.team1.toUpperCase());
      const id2 = teamNameToId.get(m.team2.toUpperCase());
      if (id1 && !seen.has(id1)) { seen.add(id1); ids.push(id1); }
      if (id2 && !seen.has(id2)) { seen.add(id2); ids.push(id2); }
    }
  }

  const hasIds = ids.length > 0;
  const idsKey = ids.sort().join(',');

  const { data } = useQuery({
    queryKey: ['partial-scores', rodadaSelecionada, idsKey, resolvedLeague ?? 'default'],
    queryFn: async () => {
      const url = buildCartolaUrl(
        { action: 'batch_lineups', ids: idsKey, rodada: rodadaSelecionada },
        resolvedLeague,
      );
      const res = await fetch(url, {
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error(`batch_lineups failed: ${res.status}`);
      const json = await res.json();
      return {
        scores: (json.scores ?? {}) as Record<string, number | null>,
        playedCounts: (json.playedCounts ?? {}) as Record<string, number>,
      };
    },
    enabled: enabled && hasIds,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const scores = new Map<string, number>();
  const playedCounts = new Map<string, number>();

  if (data) {
    for (const [id, score] of Object.entries(data.scores)) {
      if (score !== null && score !== undefined) {
        scores.set(String(id), score);
      }
    }
    for (const [id, count] of Object.entries(data.playedCounts)) {
      playedCounts.set(String(id), count);
    }
  }

  return { scores, playedCounts };
}
