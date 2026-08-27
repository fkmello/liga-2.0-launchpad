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
      const { error } = await supabase
        .from('league_closed_periods')
        .insert({ period_key: key, season_year: seasonYear, closed_by: user?.id });
      if (error) throw error;
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
