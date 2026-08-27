/**
 * Providers são abertos por definição: qualquer string é um ProviderId válido.
 * As constantes abaixo existem apenas por conveniência/autocomplete — adicionar
 * um novo provider (fifa, sofascore, football_data, ...) nunca exige alterar
 * tipos ou arquitetura.
 */
export type ProviderId = string;

export const KnownProviders = {
  GOOGLE_SHEETS: 'google_sheets',
  CARTOLA_COPA: 'cartola_copa',
  CARTOLA_BRASILEIRAO: 'cartola_brasileirao',
  CARTOLA_CHAMPIONS: 'cartola_champions',
  CUSTOM: 'custom',
} as const;

/** Natureza da fonte — conceito separado de "quem fornece" (provider). */
export type SourceType = 'sheet' | 'api' | 'manual';

/** Fonte oficial ativa de um torneio (feature flag do registry). */
export type ActiveSync = 'sheet' | 'api' | 'hybrid';
