import { describe, expect, it } from 'vitest';
import { getBadgeOriginFallback } from '@/lib/copaBrasilBadge';

describe('getBadgeOriginFallback', () => {
  it('extracts the original image URL from a Cartola proxy URL', () => {
    expect(getBadgeOriginFallback(
      'https://s2-cartola.glbimg.com/resize/90x90/abc=/https://s3.glbimg.com/escudo.png',
    )).toBe('https://s3.glbimg.com/escudo.png');
  });

  it('does not rewrite ordinary image URLs', () => {
    expect(getBadgeOriginFallback('https://cdn.example.test/escudo.png')).toBeNull();
  });

  it('rejects malformed proxy suffixes', () => {
    expect(getBadgeOriginFallback('https://proxy.example/path=/not-a-url')).toBeNull();
  });
});
