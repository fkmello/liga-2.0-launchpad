/**
 * Status semântico do compare.
 *
 *   MATCH   → payload funcionalmente idêntico
 *   WARNING → diferenças apenas em campos técnicos (metadata, hash, synced_at…)
 *   ERROR   → diferenças funcionais (fases, confrontos, classificação, dados_externos)
 *
 * Fail-safe: tudo que não estiver explicitamente na lista técnica é funcional.
 */
export type CompareStatus = 'MATCH' | 'WARNING' | 'ERROR';

const TECHNICAL_PATHS = [
  'metadata',
  'hash',
  'synced_at',
  'generated_at',
  'version',
  'schema_version',
  'provider',
  'source_type',
];

export function isTechnicalField(path: string): boolean {
  const root = path.split('.')[0];
  return TECHNICAL_PATHS.includes(root) || TECHNICAL_PATHS.includes(path);
}

export interface CompareStatusResult {
  status: CompareStatus;
  functional_fields: string[];
  technical_fields: string[];
}

export function resolveCompareStatus(fieldsDiffering: string[]): CompareStatusResult {
  const technical_fields: string[] = [];
  const functional_fields: string[] = [];
  for (const f of fieldsDiffering) {
    (isTechnicalField(f) ? technical_fields : functional_fields).push(f);
  }
  const status: CompareStatus = functional_fields.length
    ? 'ERROR'
    : technical_fields.length
      ? 'WARNING'
      : 'MATCH';
  return { status, functional_fields, technical_fields };
}
