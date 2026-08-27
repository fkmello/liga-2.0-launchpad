import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLeague } from '@/contexts/AppLeagueContext';

/**
 * Retorna os times do usuário filtrados pela liga ativa do app.
 * Times sem campo `league` (legado) são tratados como `brasileirao`.
 * Se a liga não estiver definida ainda, retorna lista vazia.
 */
export function useUserTeamsForLeague() {
  const { userTeams } = useAuth();
  const { league } = useAppLeague();

  return useMemo(() => {
    if (!league) return [];
    return (userTeams ?? []).filter(
      (t: any) => (t.league ?? 'brasileirao') === league,
    );
  }, [userTeams, league]);
}
