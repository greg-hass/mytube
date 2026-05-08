import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearVideoProgress,
  getVideoProgress,
  getVideoProgressPercent,
  saveVideoProgress,
} from './video-progress';

describe('video progress storage', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    });
  });

  it('stores and reads resumable playback progress', () => {
    saveVideoProgress('video-1', 45, 120);

    expect(getVideoProgress('video-1')).toMatchObject({
      currentTime: 45,
      duration: 120,
    });
    expect(getVideoProgressPercent('video-1')).toBe(37.5);
  });

  it('clears progress when the video is basically finished', () => {
    saveVideoProgress('video-1', 118, 120);

    expect(getVideoProgress('video-1')).toBeNull();
    expect(getVideoProgressPercent('video-1')).toBe(0);
  });

  it('can clear one video without losing another', () => {
    saveVideoProgress('video-1', 30, 120);
    saveVideoProgress('video-2', 20, 100);

    clearVideoProgress('video-1');

    expect(getVideoProgress('video-1')).toBeNull();
    expect(getVideoProgress('video-2')).toMatchObject({ currentTime: 20 });
  });
});
