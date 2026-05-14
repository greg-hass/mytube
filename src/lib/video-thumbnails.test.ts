import { describe, expect, it } from 'vitest';
import { getHighResolutionVideoThumbnail, getNextVideoThumbnailFallback } from './video-thumbnails';

describe('video thumbnails', () => {
  it('upgrades YouTube video thumbnails to max resolution', () => {
    expect(getHighResolutionVideoThumbnail('https://i.ytimg.com/vi/abc123/hqdefault.jpg')).toBe(
      'https://i.ytimg.com/vi/abc123/maxresdefault.jpg'
    );
  });

  it('upgrades YouTube webp thumbnails and preserves query strings', () => {
    expect(getHighResolutionVideoThumbnail('https://i.ytimg.com/vi_webp/abc123/hqdefault.webp?sqp=-oaymw')).toBe(
      'https://i.ytimg.com/vi_webp/abc123/maxresdefault.webp?sqp=-oaymw'
    );
  });

  it('falls back through lower quality YouTube thumbnail sizes', () => {
    expect(getNextVideoThumbnailFallback('https://i.ytimg.com/vi/abc123/maxresdefault.jpg')).toBe(
      'https://i.ytimg.com/vi/abc123/sddefault.jpg'
    );
    expect(getNextVideoThumbnailFallback('https://i.ytimg.com/vi/abc123/sddefault.jpg')).toBe(
      'https://i.ytimg.com/vi/abc123/hqdefault.jpg'
    );
    expect(getNextVideoThumbnailFallback('https://i.ytimg.com/vi/abc123/hqdefault.jpg')).toBe(
      'https://i.ytimg.com/vi/abc123/mqdefault.jpg'
    );
  });

  it('leaves non-YouTube thumbnail URLs alone', () => {
    expect(getHighResolutionVideoThumbnail('https://example.com/video.jpg')).toBe('https://example.com/video.jpg');
    expect(getNextVideoThumbnailFallback('https://example.com/video.jpg')).toBeNull();
  });
});
