import { describe, expect, it } from 'vitest';
import { getHighResolutionVideoThumbnail, getNextVideoThumbnailFallback } from './video-thumbnails';

describe('video thumbnails', () => {
  it('keeps standard feed thumbnails as the first choice for regular videos', () => {
    expect(getHighResolutionVideoThumbnail('https://i.ytimg.com/vi/abc123/hqdefault.jpg')).toBe(
      'https://i.ytimg.com/vi/abc123/hqdefault.jpg'
    );
  });

  it('keeps YouTube webp feed thumbnails and preserves query strings', () => {
    expect(getHighResolutionVideoThumbnail('https://i.ytimg.com/vi_webp/abc123/hqdefault.webp?sqp=-oaymw')).toBe(
      'https://i.ytimg.com/vi_webp/abc123/hqdefault.webp?sqp=-oaymw'
    );
  });

  it('normalizes numbered YouTube thumbnails to the dependable feed thumbnail size', () => {
    expect(getHighResolutionVideoThumbnail('https://img.youtube.com/vi/abc123/0.jpg')).toBe(
      'https://img.youtube.com/vi/abc123/hqdefault.jpg'
    );
  });

  it('keeps sharded ytimg video feed thumbnails', () => {
    expect(getHighResolutionVideoThumbnail('https://i3.ytimg.com/vi/abc123/hqdefault.jpg')).toBe(
      'https://i3.ytimg.com/vi/abc123/hqdefault.jpg'
    );
  });

  it('uses portrait YouTube thumbnail variants for Shorts', () => {
    expect(getHighResolutionVideoThumbnail('https://i.ytimg.com/vi/abc123/hqdefault.jpg', { isShort: true })).toBe(
      'https://i.ytimg.com/vi/abc123/oar2.jpg'
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
      'https://i.ytimg.com/vi/abc123/hqdefault.jpg'
    );
  });

  it('falls back through dependable YouTube thumbnail sizes', () => {
    expect(getNextVideoThumbnailFallback('https://i.ytimg.com/vi/abc123/hqdefault.jpg')).toBe(
      'https://i.ytimg.com/vi/abc123/mqdefault.jpg'
    );
    expect(getNextVideoThumbnailFallback('https://i.ytimg.com/vi/abc123/mqdefault.jpg')).toBe(
      'https://i.ytimg.com/vi/abc123/default.jpg'
    );
  });

  it('leaves non-YouTube thumbnail URLs alone', () => {
    expect(getHighResolutionVideoThumbnail('https://example.com/video.jpg')).toBe('https://example.com/video.jpg');
    expect(getNextVideoThumbnailFallback('https://example.com/video.jpg')).toBeNull();
  });
});
