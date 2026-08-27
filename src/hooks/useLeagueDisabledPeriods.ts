import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCanonicalKey, CURRENT_SEASON_YEAR } from '@/utils/leaguePeriods';
import { useAuth } from '@/contexts/AuthContext';

export const useLeagueDisabledPeriods = (seasonYear = CURRENT_SEASON_YEAR) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const queryKey = ['league-disabled-periods', seasonYear];

  const { data: disabledKeys = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_disabled_periods')
        .select('period_key')
        .eq('season_year', seasonYear);
      if (error) throw error;
      return data.map(r => r.period_key);
    },
  });

  const isPeriodDisabled = (label: string): boolean => {
    const key = getCanonicalKey(label);
    return disabledKeys.includes(key);
  };

  const disablePeriod = useMutation({
    mutationFn: async (label: string) => {
      const key = getCanonicalKey(label);
      const { error } = await supabase
        .from('league_disabled_periods')
        .insert({ period_key: key, season_year: seasonYear, disabled_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const enablePeriod = useMutation({
    mutationFn: async (label: string) => {
      const key = getCanonicalKey(label);
      const { error } = await supabase
        .from('league_disabled_periods')
        .delete()
        .eq('period_key', key)
        .eq('season_year', seasonYear);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return { isPeriodDisabled, disabledKeys, isLoading, disablePeriod, enablePeriod };
};
