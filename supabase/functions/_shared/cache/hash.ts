/**
 * Serialização estável + SHA-256 sobre o conteúdo funcional do payload.
 * `synced_at` e `metadata` são ignorados de propósito.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export async function hashPayloadContent(payload: {
  fases: unknown;
  classificacao: unknown;
  dados_externos: unknown;
}): Promise<string> {
  const input = stableStringify({
    fases: payload.fases,
    classificacao: payload.classificacao,
    dados_externos: payload.dados_externos,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
