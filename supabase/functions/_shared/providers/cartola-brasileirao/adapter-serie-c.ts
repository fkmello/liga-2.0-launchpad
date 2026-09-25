import { createCartolaBrasileiraoAdapter } from './adapter.ts';

/**
 * Instância isolada da Série C. Compartilha integralmente a lógica já validada
 * do Brasileirão, mantendo identificação própria no pipeline e nos logs.
 */
export const cartolaBrasileiraoSerieCAdapter = createCartolaBrasileiraoAdapter(
  'cartola_brasileirao_serie_c_v1',
);
