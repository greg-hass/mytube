// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pwaRuntimeCaching } from './vite.config';

describe('PWA runtime caching', () => {
  it('keeps YouTube thumbnails and proxied channel icons in longer-lived caches', () => {
    const cacheNames = pwaRuntimeCaching.map((entry) => entry.options?.cacheName);

    expect(cacheNames).toContain('youtube-images');
    expect(cacheNames).toContain('channel-icons');
    expect(pwaRuntimeCaching.some((entry) => String(entry.urlPattern).includes('yt3'))).toBe(true);
    expect(pwaRuntimeCaching.some((entry) => String(entry.urlPattern).includes('/api/channel-thumbnail'))).toBe(true);
  });
});
