import { createCartolaBrasileiraoAdapter } from './adapter.ts';

/**
 * Instância isolada da Série B. Compartilha integralmente a lógica já validada
 * do Brasileirão, mantendo identificação própria no pipeline e nos logs.
 */
export const cartolaBrasileiraoSerieBAdapter = createCartolaBrasileiraoAdapter(
  'cartola_brasileirao_serie_b_v1',
);
