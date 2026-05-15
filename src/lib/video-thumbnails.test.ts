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

  it('upgrades numbered YouTube thumbnails to max resolution', () => {
    expect(getHighResolutionVideoThumbnail('https://img.youtube.com/vi/abc123/0.jpg')).toBe(
      'https://img.youtube.com/vi/abc123/maxresdefault.jpg'
    );
  });

  it('uses portrait YouTube thumbnail variants for Shorts', () => {
    expect(getHighResolutionVideoThumbnail('https://i.ytimg.com/vi/abc123/hqdefault.jpg', { isShort: true })).toBe(
      'https://i.ytimg.com/vi/abc123/oar2.jpg'
    );
  });

  it('can probe the portrait Shorts thumbnail before falling back to max resolution landscape', () => {
    const probe = getHighResolutionVideoThumbnail('https://i.ytimg.com/vi/abc123/hqdefault.jpg', { probeShorts: true });

    expect(probe).toBe('https://i.ytimg.com/vi/abc123/oar2.jpg');
    expect(getNextVideoThumbnailFallback(probe, { probeShorts: true })).toBe(
      'https://i.ytimg.com/vi/abc123/maxresdefault.jpg'
    );
  });

  it('falls back through portrait Shorts thumbnails before landscape thumbnails', () => {
    expect(getNextVideoThumbnailFallback('https://i.ytimg.com/vi/abc123/oar2.jpg')).toBe(
      'https://i.ytimg.com/vi/abc123/maxres2.jpg'
    );
    expect(getNextVideoThumbnailFallback('https://i.ytimg.com/vi/abc123/maxres2.jpg')).toBe(
      'https://i.ytimg.com/vi/abc123/hq2.jpg'
    );
    expect(getNextVideoThumbnailFallback('https://i.ytimg.com/vi/abc123/hq2.jpg')).toBe(
      'https://i.ytimg.com/vi/abc123/frame0.jpg'
    );
    expect(getNextVideoThumbnailFallback('https://i.ytimg.com/vi/abc123/frame0.jpg')).toBe(
      'https://i.ytimg.com/vi/abc123/maxresdefault.jpg'
    );
  });

  it('falls back through lower quality YouTube thumbnail sizes', () => {
    expect(getNextVideoThumbnailFallback('https://i.ytimg.com/vi/abc123/maxresdefault.jpg')).toBe(
      'https://i.ytimg.com/vi/abc123/hq720.jpg'
    );
    expect(getNextVideoThumbnailFallback('https://i.ytimg.com/vi/abc123/hq720.jpg')).toBe(
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
