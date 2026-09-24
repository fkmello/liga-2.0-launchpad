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

/** Série B preparada no Shadow, mas ainda mantida integralmente no legado. */
export const USE_CONSOLIDATED_SERIE_B = false;
