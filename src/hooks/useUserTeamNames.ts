import { useAuth } from '@/contexts/AuthContext';
import { useMemo } from 'react';

export function useUserTeamNames() {
  const { userTeams } = useAuth();

  const teamNames = useMemo(() => {
    const set = new Set<string>();
    userTeams.forEach(t => {
      set.add(t.team_name.trim().toUpperCase());
    });
    return set;
  }, [userTeams]);

  const isUserTeam = (name: string) =>
    teamNames.has(name.trim().toUpperCase());

  return { teamNames, isUserTeam };
}
