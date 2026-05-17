import { describe, expect, it } from 'vitest';
import {
  getHighResolutionVideoThumbnail,
  getNextVideoThumbnailFallback,
  isLikelyLowResolutionYouTubePlaceholder,
} from './video-thumbnails';

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

  it('upgrades sharded ytimg video thumbnail hosts to max resolution', () => {
    expect(getHighResolutionVideoThumbnail('https://i3.ytimg.com/vi/abc123/hqdefault.jpg')).toBe(
      'https://i3.ytimg.com/vi/abc123/maxresdefault.jpg'
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

  it('detects tiny loaded YouTube placeholders across fallback thumbnail sizes', () => {
    const image = { naturalWidth: 120, naturalHeight: 90 };

    expect(isLikelyLowResolutionYouTubePlaceholder('https://i.ytimg.com/vi/abc123/oar2.jpg', image)).toBe(true);
    expect(isLikelyLowResolutionYouTubePlaceholder('https://i.ytimg.com/vi/abc123/maxres2.jpg', image)).toBe(true);
    expect(isLikelyLowResolutionYouTubePlaceholder('https://i.ytimg.com/vi/abc123/hq2.jpg', image)).toBe(true);
    expect(isLikelyLowResolutionYouTubePlaceholder('https://i.ytimg.com/vi/abc123/frame0.jpg', image)).toBe(true);
    expect(isLikelyLowResolutionYouTubePlaceholder('https://i.ytimg.com/vi/abc123/hqdefault.jpg', image)).toBe(true);
    expect(isLikelyLowResolutionYouTubePlaceholder('https://i.ytimg.com/vi/abc123/mqdefault.jpg', image)).toBe(true);
  });

  it('keeps real medium-quality YouTube thumbnails', () => {
    expect(
      isLikelyLowResolutionYouTubePlaceholder(
        'https://i.ytimg.com/vi/abc123/mqdefault.jpg',
        { naturalWidth: 320, naturalHeight: 180 }
      )
    ).toBe(false);
  });
});
