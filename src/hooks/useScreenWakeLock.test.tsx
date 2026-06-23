import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScreenWakeLock } from './useScreenWakeLock';

describe('useScreenWakeLock', () => {
  const release = vi.fn().mockResolvedValue(undefined);
  const request = vi.fn().mockResolvedValue({
    release,
    addEventListener: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    vi.stubGlobal('navigator', {
      wakeLock: { request },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests a screen wake lock when the app is visible and releases it on cleanup', async () => {
    const { unmount } = renderHook(() => useScreenWakeLock());

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith('screen');
    });

    await act(async () => {
      unmount();
    });

    expect(release).toHaveBeenCalled();
  });

  it('reacquires the wake lock after the app returns to the foreground', async () => {
    renderHook(() => useScreenWakeLock());

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(1);
    });

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(release).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(2);
    });
  });
});
