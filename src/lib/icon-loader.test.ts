import { describe, expect, it } from 'vitest';
import { generatePlaceholderThumbnail, getDisplayThumbnail } from './icon-loader';

describe('generatePlaceholderThumbnail', () => {
  it('generates a branded initial placeholder instead of a dull gray block', () => {
    const placeholder = decodeURIComponent(generatePlaceholderThumbnail('ETA PRIME'));

    expect(placeholder).toContain('EP');
    expect(placeholder).toContain('linearGradient');
    expect(placeholder).not.toContain("fill='#333'");
  });
});

describe('getDisplayThumbnail', () => {
  it('routes YouTube channel thumbnails through the local proxy', () => {
    const url = 'https://yt3.googleusercontent.com/avatar=s900-c-k-c0x00ffffff-no-rj';

    expect(getDisplayThumbnail(url, 'Test Channel')).toBe(
      `/api/channel-thumbnail?url=${encodeURIComponent(url)}`
    );
  });

  it('keeps data thumbnails unchanged', () => {
    const thumbnail = generatePlaceholderThumbnail('Test Channel');
    expect(getDisplayThumbnail(thumbnail, 'Test Channel')).toBe(thumbnail);
  });
});
