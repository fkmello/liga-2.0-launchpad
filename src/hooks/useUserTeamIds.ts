import { useMemo } from 'react';
import { useUserTeamsForLeague } from './useUserTeamsForLeague';

/**
 * Set de id_cartola dos times do usuário na liga ativa.
 * Usado para destacar times do usuário em torneios via match por ID
 * (resolve mismatches de nome como "Dicas do Jaca" vs "Jaca - Champions").
 */
export function useUserTeamIds(): Set<string> {
  const teams = useUserTeamsForLeague();
  return useMemo(() => {
    const set = new Set<string>();
    for (const t of teams) {
      if (t?.id_cartola) set.add(String(t.id_cartola));
    }
    return set;
  }, [teams]);
}

const normalizeName = (n: string) =>
  n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Constrói um isUserTeam(name) que primeiro tenta resolver via mapa nome→id
 * (dados externos da planilha do torneio) e compara o id contra os ids do
 * usuário. Se o nome não estiver no mapa, faz fallback por nome normalizado.
 */
export function buildIsUserTeamById(
  teamNameToId: Map<string, string>,
  userIds: Set<string>,
  userTeamNames?: Set<string>,
): (name: string) => boolean {
  return (name: string) => {
    if (!name) return false;
    const upper = name.trim().toUpperCase();
    const id = teamNameToId.get(upper);
    if (id && userIds.has(id)) return true;
    // fallback por nome
    if (userTeamNames && userTeamNames.has(upper)) return true;
    if (userTeamNames) {
      const norm = normalizeName(name);
      for (const n of userTeamNames) {
        if (normalizeName(n) === norm) return true;
      }
    }
    return false;
  };
}
