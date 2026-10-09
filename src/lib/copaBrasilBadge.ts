/**
 * Cartola's image proxy URLs can fail while the original image remains available.
 * Example: https://proxy.example/path=/https://origin.example/badge.png
 * In that case, retry the embedded origin URL once before hiding the badge.
 */
export function getBadgeOriginFallback(url: string): string | null {
  const marker = url.lastIndexOf('=/');
  if (marker < 0) return null;
  const candidate = url.slice(marker + 2).trim();
  if (!/^https?:\/\//i.test(candidate) || candidate === url) return null;
  return candidate;
}
