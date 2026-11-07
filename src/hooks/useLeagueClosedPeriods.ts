import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCanonicalKey, CURRENT_SEASON_YEAR } from '@/utils/leaguePeriods';
import { useAuth } from '@/contexts/AuthContext';

export const useLeagueClosedPeriods = (seasonYear = CURRENT_SEASON_YEAR) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const queryKey = ['league-closed-periods', seasonYear];

  const { data: closedKeys = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_closed_periods')
        .select('period_key')
        .eq('season_year', seasonYear);
      if (error) throw error;
      return data.map(r => r.period_key);
    },
  });

  const isPeriodClosed = (label: string): boolean => {
    const key = getCanonicalKey(label);
    return closedKeys.includes(key);
  };

  const closePeriod = useMutation({
    mutationFn: async (label: string) => {
      const key = getCanonicalKey(label);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.access_token) throw new Error('Sua sessão expirou. Entre novamente e tente outra vez.');
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-classic-league?season=${seasonYear}&action=close_period&periodo=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true || result.closed !== true) {
        throw new Error(result.error || `Não foi possível fechar o período (HTTP ${response.status}).`);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const reopenPeriod = useMutation({
    mutationFn: async (label: string) => {
      const key = getCanonicalKey(label);
      const { error } = await supabase
        .from('league_closed_periods')
        .delete()
        .eq('period_key', key)
        .eq('season_year', seasonYear);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return { isPeriodClosed, closedKeys, isLoading, closePeriod, reopenPeriod };
};
