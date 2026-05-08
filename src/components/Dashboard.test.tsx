import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';

type MockRSSVideosState = {
  videos: Array<{
    id: string;
    title: string;
    description: string;
    thumbnail: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    duration?: number | null;
  }>;
  isLoading: boolean;
  refresh: ReturnType<typeof vi.fn>;
  syncStatus: {
    total: number;
    current: number;
    isSyncing: boolean;
    lastUpdated: number;
    errors: number;
    videos: number;
    state: 'idle' | 'running' | 'queued' | 'error';
  };
};

let mockRSSVideosState: MockRSSVideosState = {
  videos: [],
  isLoading: false,
  refresh: vi.fn(),
  syncStatus: {
    total: 0,
    current: 0,
    isSyncing: false,
    lastUpdated: Date.now(),
    errors: 0,
    videos: 0,
    state: 'idle',
  },
};

let mockSearchQuery = '';
let mockWatchedVideos = new Set<string>();
const mockMarkAsWatched = vi.fn((videoId: string) => {
  mockWatchedVideos = new Set([...mockWatchedVideos, videoId]);
});

vi.mock('./Header', () => ({
  Header: () => <header>Header</header>,
}));

vi.mock('./SubscriptionsList', () => ({
  SubscriptionsList: () => <section>Subscriptions list content</section>,
}));

vi.mock('./VirtualizedVideoGrid', () => ({
  VirtualizedVideoGrid: ({ videos }: { videos: Array<{ id: string; title: string }> }) => (
    <section>
      {videos.length === 0 ? 'Video grid content' : videos.map(video => (
        <article key={video.id}>
          <span>{video.title}</span>
          <button
            type="button"
            aria-label={`Favorite ${video.title}`}
            onClick={() => {
              const rawFavorites = localStorage.getItem('favorite-video-ids');
              const favoriteIds = rawFavorites ? JSON.parse(rawFavorites) : [];
              localStorage.setItem('favorite-video-ids', JSON.stringify([...favoriteIds, video.id]));
              window.dispatchEvent(new Event('favorite-videos-changed'));
            }}
          >
            Favorite
          </button>
        </article>
      ))}
    </section>
  ),
}));

vi.mock('./VideoCard', () => ({
  VideoCard: ({ video }: { video: { title: string } }) => <article>{video.title}</article>,
}));

vi.mock('./AddChannelModal', () => ({
  AddChannelModal: () => null,
}));

vi.mock('./KeyboardShortcutsHelp', () => ({
  KeyboardShortcutsHelp: () => null,
}));

vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('../hooks/useRSSVideos', () => ({
  useRSSVideos: () => mockRSSVideosState,
}));

vi.mock('../hooks/useSubscriptionStorage', () => ({
  useSubscriptionStorage: () => ({
    allSubscriptions: [
      {
        id: 'UC123',
        title: 'Test Channel',
        description: '',
        thumbnail: '',
      },
    ],
    rawSubscriptions: [
      {
        id: 'UC123',
        title: 'Test Channel',
        addedAt: 0,
      },
    ],
    addSubscriptions: vi.fn(),
    toggleFavorite: vi.fn(),
  }),
}));

vi.mock('../store/useStore', () => ({
  useStore: () => ({
    searchQuery: mockSearchQuery,
    watchedVideos: mockWatchedVideos,
    markAsWatched: mockMarkAsWatched,
  }),
}));

describe('Dashboard', () => {
  beforeEach(() => {
    mockSearchQuery = '';
    mockWatchedVideos = new Set<string>();
    mockMarkAsWatched.mockClear();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    vi.stubGlobal('scrollTo', vi.fn());
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    });

    mockRSSVideosState = {
      videos: [],
      isLoading: false,
      refresh: vi.fn(),
      syncStatus: {
        total: 0,
        current: 0,
        isSyncing: false,
        lastUpdated: Date.now(),
        errors: 0,
        videos: 0,
        state: 'idle',
      },
    };
  });

  it('opens on latest videos instead of subscription management', () => {
    render(<Dashboard />);

    expect(screen.getByText('No videos found')).toBeInTheDocument();
    expect(screen.queryByText('Subscriptions list content')).not.toBeInTheDocument();
  });

  it('shows feed build progress instead of an empty state while syncing videos', () => {
    mockRSSVideosState = {
      ...mockRSSVideosState,
      syncStatus: {
        total: 261,
        current: 70,
        isSyncing: true,
        lastUpdated: Date.now(),
        errors: 0,
        videos: 135,
        state: 'running',
      },
    };

    render(<Dashboard />);

    expect(screen.getByText('Building your feed')).toBeInTheDocument();
    expect(screen.getByText('70 / 261 channels checked')).toBeInTheDocument();
    expect(screen.queryByText('No videos found')).not.toBeInTheDocument();
  });

  it('uses non-scrolling mobile tabs with normal page padding', () => {
    render(<Dashboard />);

    const tabs = screen.getByTestId('dashboard-tabs');

    expect(tabs.className).toContain('px-4');
    expect(tabs.className).toContain('sticky');
    expect(tabs.className).not.toContain('-mx-4');
    expect(tabs.className).not.toContain('overflow-x-auto');
    expect(tabs.querySelector('.grid')?.className).toContain('grid-cols-4');
    expect(tabs.querySelector('.grid')?.className).not.toContain('grid-cols-2');
  });

  it('keeps the latest refresh control out of the mobile chrome', () => {
    render(<Dashboard />);

    const refreshButton = screen.getByRole('button', { name: /refresh/i });

    expect(refreshButton.className).toContain('hidden');
    expect(refreshButton.className).toContain('sm:flex');
  });

  it('shows favorited videos in Faves from persisted video favorites', async () => {
    localStorage.setItem('favorite-video-ids', JSON.stringify(['video-1']));
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-1',
          title: 'Persisted favorite video',
          description: '',
          thumbnail: 'https://example.com/video.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
        },
      ],
    };

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /faves/i }));

    await waitFor(() => {
      expect(screen.getByText('Persisted favorite video')).toBeInTheDocument();
    });
  });

  it('shows saved favorite video records even before the feed has rebuilt', async () => {
    localStorage.setItem('favorite-video-ids', JSON.stringify(['video-1']));
    localStorage.setItem('favorite-videos', JSON.stringify([
      {
        id: 'video-1',
        title: 'Saved favorite without feed data',
        description: '',
        thumbnail: 'https://example.com/video.jpg',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: new Date().toISOString(),
      },
    ]));

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /faves/i }));

    await waitFor(() => {
      expect(screen.getByText('Saved favorite without feed data')).toBeInTheDocument();
    });
  });

  it('uses current feed details for saved favorites when they are available', async () => {
    localStorage.setItem('favorite-video-ids', JSON.stringify(['video-1']));
    localStorage.setItem('favorite-videos', JSON.stringify([
      {
        id: 'video-1',
        title: 'Older saved title',
        description: '',
        thumbnail: 'https://example.com/video.jpg',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: new Date().toISOString(),
      },
    ]));
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-1',
          title: 'Fresh feed title',
          description: '',
          thumbnail: 'https://example.com/video.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
        },
      ],
    };

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /faves/i }));

    await waitFor(() => {
      expect(screen.getByText('Fresh feed title')).toBeInTheDocument();
    });
    expect(screen.queryByText('Older saved title')).not.toBeInTheDocument();
  });

  it('shows a video in Faves after it is favorited while Dashboard is open', async () => {
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-1',
          title: 'Live favorite video',
          description: '',
          thumbnail: 'https://example.com/video.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
        },
      ],
    };

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Favorite Live favorite video' }));
    fireEvent.click(screen.getByRole('button', { name: /faves/i }));

    await waitFor(() => {
      expect(screen.getByText('Live favorite video')).toBeInTheDocument();
    });
  });

  it('opens Faves at the top instead of inheriting timeline scroll', async () => {
    sessionStorage.setItem('favorite-videos-scroll', '480');
    localStorage.setItem('favorite-video-ids', JSON.stringify(['video-1']));
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-1',
          title: 'Top favorite video',
          description: '',
          thumbnail: 'https://example.com/video.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
        },
      ],
    };

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /faves/i }));

    await waitFor(() => {
      expect(screen.getByText('Top favorite video')).toBeInTheDocument();
    });
    expect(sessionStorage.getItem('favorite-videos-scroll')).toBeNull();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('hides videos that look like Shorts when the Shorts toggle is off', () => {
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-1',
          title: 'Normal upload',
          description: '',
          thumbnail: 'https://example.com/video.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
          duration: null,
        },
        {
          id: 'video-2',
          title: 'Quick tip AJ#shorts',
          description: '',
          thumbnail: 'https://example.com/short.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
          duration: null,
        },
      ],
    };

    render(<Dashboard />);

    expect(screen.getByText('Normal upload')).toBeInTheDocument();
    expect(screen.getByText('Quick tip AJ#shorts')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Shorts'));

    expect(screen.getByText('Normal upload')).toBeInTheDocument();
    expect(screen.queryByText('Quick tip AJ#shorts')).not.toBeInTheDocument();
  });

  it('can hide watched videos from Latest', () => {
    mockWatchedVideos = new Set(['video-1']);
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-1',
          title: 'Already watched upload',
          description: '',
          thumbnail: 'https://example.com/watched.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
        },
        {
          id: 'video-2',
          title: 'Fresh unwatched upload',
          description: '',
          thumbnail: 'https://example.com/unwatched.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
        },
      ],
    };

    render(<Dashboard />);

    expect(screen.getByText('Already watched upload')).toBeInTheDocument();
    expect(screen.getByText('Fresh unwatched upload')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Hide watched'));

    expect(screen.queryByText('Already watched upload')).not.toBeInTheDocument();
    expect(screen.getByText('Fresh unwatched upload')).toBeInTheDocument();
  });

  it('filters latest videos by video title and channel name', () => {
    mockSearchQuery = 'linux';
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-1',
          title: 'Linux weekly roundup',
          description: '',
          thumbnail: 'https://example.com/linux.jpg',
          channelId: 'UC123',
          channelTitle: 'Tech Channel',
          publishedAt: new Date().toISOString(),
        },
        {
          id: 'video-2',
          title: 'Football highlights',
          description: '',
          thumbnail: 'https://example.com/sport.jpg',
          channelId: 'UC123',
          channelTitle: 'Sports Channel',
          publishedAt: new Date().toISOString(),
        },
        {
          id: 'video-3',
          title: 'Security bulletin',
          description: '',
          thumbnail: 'https://example.com/security.jpg',
          channelId: 'UC123',
          channelTitle: 'Linux News',
          publishedAt: new Date().toISOString(),
        },
      ],
    };

    render(<Dashboard />);

    expect(screen.getByText('Linux weekly roundup')).toBeInTheDocument();
    expect(screen.getByText('Security bulletin')).toBeInTheDocument();
    expect(screen.queryByText('Football highlights')).not.toBeInTheDocument();
  });
});
