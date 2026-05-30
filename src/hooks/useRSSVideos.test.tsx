import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useRSSVideos } from './useRSSVideos';

vi.mock('sonner', () => ({
  toast: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useRSSVideos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('keeps manual refresh quiet and leaves cached videos visible', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith('/api/videos/status')) {
        return new Response(JSON.stringify({
          state: 'idle',
          current: 1,
          total: 1,
          videos: 1,
          errors: 0,
          startedAt: null,
          completedAt: null,
          lastUpdated: '2026-05-06T20:00:00.000Z',
        }));
      }

      if (url.startsWith('/api/videos?')) {
        return new Response(JSON.stringify({
          videos: [{
            id: 'video-1',
            title: 'Cached video',
            description: '',
            thumbnail: '',
            channelId: 'UC123',
            channelTitle: 'Test Channel',
            publishedAt: '2026-05-06T20:00:00.000Z',
          }],
          lastUpdated: '2026-05-06T20:00:00.000Z',
          totalChannels: 1,
          totalVideos: 1,
        }));
      }

      if (url === '/api/videos/refresh') {
        return new Response(JSON.stringify({ success: true }));
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRSSVideos(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.videos).toHaveLength(1);
    });

    result.current.refresh();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/videos/refresh', { method: 'POST' });
    });

    expect(result.current.videos[0].title).toBe('Cached video');
    expect(toast.loading).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('refetches videos when server status reports a newer completed cache', async () => {
    let statusCalls = 0;
    let videoCalls = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith('/api/videos/status')) {
        statusCalls += 1;
        return new Response(JSON.stringify({
          state: statusCalls <= 1 ? 'running' : 'idle',
          current: 1,
          total: 1,
          videos: 1,
          errors: 0,
          startedAt: statusCalls <= 1 ? '2026-05-09T10:00:00.000Z' : null,
          completedAt: statusCalls <= 1 ? null : '2026-05-09T10:15:00.000Z',
          lastUpdated: statusCalls <= 1 ? '2026-05-09T10:00:00.000Z' : '2026-05-09T10:15:00.000Z',
        }));
      }

      if (url.startsWith('/api/videos?')) {
        videoCalls += 1;
        const isFresh = videoCalls > 1;
        return new Response(JSON.stringify({
          videos: [{
            id: isFresh ? 'fresh-video' : 'old-video',
            title: isFresh ? 'Fresh scheduled video' : 'Old cached video',
            description: '',
            thumbnail: '',
            channelId: 'UC123',
            channelTitle: 'Test Channel',
            publishedAt: isFresh ? '2026-05-09T10:15:00.000Z' : '2026-05-09T10:00:00.000Z',
          }],
          lastUpdated: isFresh ? '2026-05-09T10:15:00.000Z' : '2026-05-09T10:00:00.000Z',
          totalChannels: 1,
          totalVideos: 1,
        }));
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRSSVideos(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.videos[0]?.title).toBe('Old cached video');
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2100));
    });

    await waitFor(() => {
      expect(result.current.videos[0]?.title).toBe('Fresh scheduled video');
    });
  });

  it('exposes scheduled refresh timing from the server status', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith('/api/videos/status')) {
        return new Response(JSON.stringify({
          state: 'idle',
          current: 1,
          total: 1,
          videos: 1,
          errors: 0,
          startedAt: null,
          completedAt: '2026-05-09T10:00:00.000Z',
          lastUpdated: '2026-05-09T10:00:00.000Z',
          scheduledRefresh: {
            enabled: true,
            intervalMs: 15 * 60 * 1000,
            nextRunAt: '2026-05-09T10:15:00.000Z',
            lastRunAt: '2026-05-09T10:00:00.000Z',
          },
        }));
      }

      if (url.startsWith('/api/videos?')) {
        return new Response(JSON.stringify({
          videos: [],
          lastUpdated: '2026-05-09T10:00:00.000Z',
          totalChannels: 1,
          totalVideos: 1,
        }));
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRSSVideos(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.syncStatus.scheduledRefresh).toEqual({
        enabled: true,
        intervalMs: 15 * 60 * 1000,
        nextRunAt: '2026-05-09T10:15:00.000Z',
        lastRunAt: '2026-05-09T10:00:00.000Z',
      });
    });
  });
});
