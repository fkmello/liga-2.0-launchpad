const DEFAULT_TIMEOUT_MS = 10000;

export async function fetchJsonWithRetry(
  url: string,
  init: RequestInit = {},
  { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 2 } = {},
): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (!res.ok) throw new Error(`[${res.status}]: ${await res.text()}`);
      return await res.json();
    } catch (e) {
      lastError = e as Error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }
  throw new Error(`Falha ao buscar ${url}: ${lastError?.message}`);
}

export async function inChunks<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}
