/**
 * Validates and extracts the Copa do Brasil payload stored in shadow mode.
 * These helpers intentionally do not perform I/O, so the contract can be tested
 * independently and invalid/incomplete shadow data can safely fall back to legacy.
 */
function asRecord(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

export function getCopaBrasilShadowRows(payload: unknown): string[][] | null {
  const root = asRecord(payload);
  const external = asRecord(root?.dados_externos);
  const rows = external?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  if (!rows.every((row: unknown) => Array.isArray(row))) return null;
  return rows as string[][];
}

export function getCopaBrasilShadowPhase(
  payload: unknown,
  fase: string,
): Record<string, unknown> | null {
  const root = asRecord(payload);
  const fases = asRecord(root?.fases);
  const phase = asRecord(fases?.[fase]);
  if (!phase || !Array.isArray(phase.matches)) return null;
  return phase as Record<string, unknown>;
}


/**
 * O cadastro dos times e seus escudos é compartilhado por todas as fases.
 * A fase não deve fazer parte desta chave para evitar refetch e flicker ao trocar
 * a fase do mata-mata. A flag continua separando os contratos legacy e shadow.
 */
export function getCopaBrasilBaseDataQueryKey(shadowRead: boolean) {
  return ['base-dados-copa', shadowRead] as const;
}
