import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useTournamentFinished = (slug?: string) => {
  const { data, isLoading } = useQuery({
    queryKey: ['tournament-finished', slug],
    enabled: !!slug,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournament_settings')
        .select('finished')
        .eq('slug', slug!)
        .maybeSingle();
      if (error) throw error;
      return !!(data as any)?.finished;
    },
  });
  return { finished: !!data, loading: isLoading };
};
