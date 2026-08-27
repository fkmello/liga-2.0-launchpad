import { supabase } from '@/integrations/supabase/client';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-sheets`;

export async function callEdgeFunction(params: Record<string, string>) {
  const queryString = new URLSearchParams(params).toString();
  const url = `${FUNCTION_URL}?${queryString}`;

  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function fetchFromCache<T>(cacheKey: string, extractor?: (data: any) => T): Promise<T | null> {
  const { data: row, error } = await supabase
    .from('sheets_cache')
    .select('data')
    .eq('cache_key', cacheKey)
    .maybeSingle();

  if (error || !row) return null;

  const result = extractor ? extractor(row.data) : (row.data as unknown as T);
  return result ?? null;
}

export async function fetchWithFallback<T>(
  cacheKey: string,
  edgeFnParams: Record<string, string>,
  extractor?: (data: any) => T
): Promise<T> {
  const cached = await fetchFromCache<T>(cacheKey, extractor);
  if (cached !== null) return cached;

  console.warn(`[sheets-cache] Cache miss for "${cacheKey}", falling back to Edge Function`);
  return callEdgeFunction(edgeFnParams) as Promise<T>;
}

/** Lê várias chaves do cache em UMA única consulta. */
export async function fetchManyFromCache(cacheKeys: string[]): Promise<Map<string, any>> {
  const { data, error } = await supabase
    .from('sheets_cache')
    .select('cache_key, data')
    .in('cache_key', cacheKeys);

  if (error) throw error;

  const map = new Map<string, any>();
  for (const row of data ?? []) map.set(row.cache_key, row.data);
  return map;
}
