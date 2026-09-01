/**
 * Nomes antigos/divergentes vindos das planilhas → nome oficial cadastrado
 * na aba DADOS EXTERNOS (fonte do ID Cartola e do escudo).
 *
 * A chave deve estar normalizada (minúscula, sem acentos, espaços colapsados).
 */
export const TEAM_NAME_ALIASES: Record<string, string> = {
  // Guiguiba 06 — ID Cartola 25248276
  'guerreiro da villa': 'Guiguiba 06',
};

/** Normaliza um nome de time para comparação tolerante. */
export const normalizeTeamName = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * Resolve o nome oficial de um time.
 * `officialNames` é o conjunto de nomes vindos de DADOS EXTERNOS, indexado
 * pela forma normalizada — quando o nome já existe lá, ele é mantido.
 */
export const resolveTeamName = (
  name: string,
  officialNames?: Record<string, string>,
): string => {
  const key = normalizeTeamName(name);
  if (officialNames?.[key]) return officialNames[key];
  return TEAM_NAME_ALIASES[key] ?? name;
};
