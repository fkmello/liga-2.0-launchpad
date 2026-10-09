/**
 * Feature flags do frontend.
 *
 * Alternar um único booleano aqui é suficiente para rollback imediato,
 * sem tocar em nenhum hook ou componente.
 */

/**
 * Série A: quando `true`, os dados do Brasileirão Série A passam a vir do
 * payload consolidado da `sync-tournament-api`. Quando `false`, o app usa
 * exatamente o fluxo legado de hoje (chaves `resultados:*`, `classificacao:*`,
 * `dados_externos:*`).
 *
 * Nenhum outro torneio é afetado por esta flag.
 */
export const USE_CONSOLIDATED_SERIE_A = true;

/** Série B preparada no Shadow e agora ativada apenas para leitura no frontend. */
export const USE_CONSOLIDATED_SERIE_B = true;


/** Série C preparada no Shadow e agora ativada para leitura consolidada no frontend. */
export const USE_CONSOLIDATED_SERIE_C = true;

/** Copa do Brasil: read the API-backed shadow cache only after explicit frontend validation. */
export const USE_COPA_BRASIL_SHADOW_READ = false;
