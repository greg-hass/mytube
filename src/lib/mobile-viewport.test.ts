import { describe, expect, it } from 'vitest';
import { isCompactMobileViewport } from './mobile-viewport';

describe('mobile viewport detection', () => {
  it('treats portrait phone widths as mobile', () => {
    expect(isCompactMobileViewport({ width: 390, height: 844 })).toBe(true);
  });

  it('treats landscape phone viewports as mobile even when wider than sm', () => {
    expect(isCompactMobileViewport({ width: 932, height: 430 })).toBe(true);
  });

  it('does not treat tablet or desktop landscape as mobile', () => {
    expect(isCompactMobileViewport({ width: 1024, height: 768 })).toBe(false);
    expect(isCompactMobileViewport({ width: 1440, height: 900 })).toBe(false);
  });
});
