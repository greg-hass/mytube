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
    isShort?: boolean;
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
    failedChannels?: Array<{
      id: string;
      title: string;
      reason: string;
    }>;
    scheduledRefresh?: {
      enabled: boolean;
      intervalMs: number;
      nextRunAt: string | null;
      lastRunAt: string | null;
    };
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
let mockAllSubscriptions = [
  {
    id: 'UC123',
    title: 'Test Channel',
    description: '',
    thumbnail: '',
    group: 'Tech',
    isFavorite: false,
  },
];
const mockToggleChannelFavorite = vi.fn();
let latestSubscriptionsListProps: { selectedGroup?: string; groups?: string[] } | undefined;

vi.mock('./Header', () => ({
  Header: () => <header>Header</header>,
}));

vi.mock('./SubscriptionsList', () => ({
  SubscriptionsList: (props: { selectedGroup?: string; groups?: string[] }) => {
    latestSubscriptionsListProps = props;
    return <section>Subscriptions list content</section>;
  },
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

vi.mock('./SubscriptionCard', () => ({
  SubscriptionCard: ({ channel }: { channel: { title: string } }) => <article>{channel.title}</article>,
}));

vi.mock('./AddChannelModal', () => ({
  AddChannelModal: () => null,
}));

vi.mock('./OPMLUpload', () => ({
  OPMLUpload: () => <button>Import subscriptions</button>,
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
    allSubscriptions: mockAllSubscriptions,
    rawSubscriptions: [
      {
        id: 'UC123',
        title: 'Test Channel',
        addedAt: 0,
      },
    ],
    addSubscriptions: vi.fn(),
    toggleFavorite: mockToggleChannelFavorite,
    repairChannelIcons: vi.fn(),
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
    latestSubscriptionsListProps = undefined;
    mockWatchedVideos = new Set<string>();
    mockMarkAsWatched.mockClear();
    mockToggleChannelFavorite.mockClear();
    mockAllSubscriptions = [
      {
        id: 'UC123',
        title: 'Test Channel',
        description: '',
        thumbnail: '',
        group: 'Tech',
        isFavorite: false,
      },
    ];
    window.history.replaceState(null, '', '/');
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

  it('shows first-run onboarding when no subscriptions have been added', async () => {
    mockAllSubscriptions = [];

    render(<Dashboard />);

    expect(screen.getByText('Start with your subscriptions')).toBeInTheDocument();
    expect(await screen.findByText('Import subscriptions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add one channel' })).toBeInTheDocument();
  });

  it('opens the subscriptions tab from the dashboard tab URL', () => {
    window.history.replaceState(null, '', '/?tab=subscriptions');

    render(<Dashboard />);

    expect(screen.getByText('Subscriptions list content')).toBeInTheDocument();
    expect(screen.queryByText('No videos found')).not.toBeInTheDocument();
  });

  it('keeps the selected dashboard tab in the URL for browser back restores', () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /subs/i }));

    expect(window.location.search).toBe('?tab=subscriptions');
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

  it('surfaces failed channel refreshes on the latest feed', () => {
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [{
        id: 'video-1',
        title: 'Visible video',
        description: '',
        thumbnail: '',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: new Date().toISOString(),
      }],
      syncStatus: {
        ...mockRSSVideosState.syncStatus,
        errors: 1,
        failedChannels: [{
          id: 'UC_BAD',
          title: 'Broken Channel',
          reason: 'RSS feed failed with HTTP 404',
        }],
      },
    };

    render(<Dashboard />);

    expect(screen.getByText('1 channel needs attention')).toBeInTheDocument();
    expect(screen.getByText('Broken Channel')).toBeInTheDocument();
    expect(screen.getByText(/RSS feed failed with HTTP 404/)).toBeInTheDocument();
  });

  it('shows the latest refresh age and scheduled interval', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-05-09T10:05:00.000Z'));
    mockRSSVideosState = {
      ...mockRSSVideosState,
      syncStatus: {
        total: 1,
        current: 1,
        isSyncing: false,
        lastUpdated: Date.parse('2026-05-09T10:00:00.000Z'),
        errors: 0,
        videos: 1,
        state: 'idle',
        scheduledRefresh: {
          enabled: true,
          intervalMs: 15 * 60 * 1000,
          nextRunAt: '2026-05-09T10:15:00.000Z',
          lastRunAt: '2026-05-09T10:00:00.000Z',
        },
      },
    };

    render(<Dashboard />);

    expect(screen.getByText('Last refreshed 5m ago')).toBeInTheDocument();
    expect(screen.getByText('Auto 15m')).toBeInTheDocument();
  });

  it('uses stable app chrome spacing for tabs and latest filters', () => {
    render(<Dashboard />);

    const pageChrome = screen.getByTestId('dashboard-page-chrome');
    const tabs = screen.getByTestId('dashboard-tabs');

    expect(pageChrome.className).toContain('pt-[var(--app-sticky-gap)]');
    expect(pageChrome.className).toContain('sm:pt-[var(--app-sticky-gap)]');
    expect(tabs.className).toContain('px-4');
    expect(tabs.className).toContain('sticky');
    expect(tabs.className).toContain('top-[calc(env(safe-area-inset-top)+var(--app-header-height)+var(--app-sticky-gap))]');
    expect(tabs.className).toContain('before:bottom-full');
    expect(tabs.className).toContain('before:h-[var(--app-sticky-gap)]');
    expect(tabs.className).toContain('before:bg-gray-50');
    expect(tabs.className).toContain('dark:before:bg-gray-950');
    expect(tabs.className).not.toContain('sm:mb-8');
    expect(tabs.className).not.toContain('-mx-4');
    expect(tabs.className).not.toContain('overflow-x-auto');
    expect(tabs.querySelector('.grid')?.className).toContain('grid-cols-5');
    expect(tabs.querySelector('.grid')?.className).not.toContain('grid-cols-2');
  });

  it('keeps subscription group controls inside the same sticky chrome as the tabs', async () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /subs/i }));

    const tabs = screen.getByTestId('dashboard-tabs');
    const groupToolbar = screen.getByTestId('subscription-groups-toolbar');

    expect(tabs).toContainElement(groupToolbar);
    expect(groupToolbar.className).toContain('mt-[var(--app-sticky-gap)]');
    expect(groupToolbar.className.split(' ')).not.toContain('sticky');
    expect(groupToolbar.className.split(' ').some((className) => className.startsWith('top-['))).toBe(false);
    expect(screen.getByLabelText('Filter group')).toBeInTheDocument();
    await waitFor(() => {
      expect(latestSubscriptionsListProps).toEqual({
        selectedGroup: 'all',
        groups: ['Tech'],
      });
    });
  });

  it('creates subscription groups from a single toolbar dialog', async () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /subs/i }));

    expect(screen.queryByLabelText('Group name')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add group' }));

    expect(screen.getByRole('dialog', { name: 'New group' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Group name'), {
      target: { value: 'Linux' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'New group' })).not.toBeInTheDocument();
      expect(latestSubscriptionsListProps).toEqual({
        selectedGroup: 'all',
        groups: ['Linux', 'Tech'],
      });
    });
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

  it('splits Faves into favorite channels and favorite videos', async () => {
    mockAllSubscriptions = [
      {
        id: 'UC123',
        title: 'Favorite Channel',
        description: '',
        thumbnail: '',
        group: 'Tech',
        isFavorite: true,
      },
    ];
    localStorage.setItem('favorite-video-ids', JSON.stringify(['video-1']));
    localStorage.setItem('favorite-videos', JSON.stringify([
      {
        id: 'video-1',
        title: 'Favorite Video',
        description: '',
        thumbnail: 'https://example.com/video.jpg',
        channelId: 'UC123',
        channelTitle: 'Favorite Channel',
        publishedAt: new Date().toISOString(),
      },
    ]));

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /faves/i }));

    await waitFor(() => {
      expect(screen.getByText('Favorite Channel')).toBeInTheDocument();
      expect(screen.getByText('Favorite Video')).toBeInTheDocument();
    });

    expect(screen.getByTestId('favorite-section-switcher')).toHaveClass('sm:hidden');
    expect(screen.getByRole('button', { name: 'Channels (1)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('favorite-channels-section')).toHaveClass('block');
    expect(screen.getByTestId('favorite-videos-section')).toHaveClass('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Videos (1)' }));

    expect(screen.getByRole('button', { name: 'Videos (1)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('favorite-channels-section')).toHaveClass('hidden');
    expect(screen.getByTestId('favorite-videos-section')).toHaveClass('block');
  });

  it('shows the mobile Faves splitter even when only channels are favorited', async () => {
    mockAllSubscriptions = [
      {
        id: 'UC123',
        title: 'Favorite Channel',
        description: '',
        thumbnail: '',
        group: 'Tech',
        isFavorite: true,
      },
    ];

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /faves/i }));

    await waitFor(() => {
      expect(screen.getByText('Favorite Channel')).toBeInTheDocument();
    });

    expect(screen.getByTestId('favorite-section-switcher')).toHaveClass('sm:hidden');
    expect(screen.getByRole('button', { name: 'Channels (1)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Videos (0)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Videos (0)' }));

    expect(screen.getByTestId('favorite-channels-section')).toHaveClass('hidden');
    expect(screen.getByTestId('favorite-videos-section')).toHaveClass('block');
    expect(screen.getByText('No favorite videos yet')).toBeInTheDocument();
  });

  it('shows queued videos in Queue separately from Faves', async () => {
    localStorage.setItem('queued-video-ids', JSON.stringify(['video-1']));
    localStorage.setItem('queued-videos', JSON.stringify([
      {
        id: 'video-1',
        title: 'Queued watch later video',
        description: '',
        thumbnail: 'https://example.com/video.jpg',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: new Date().toISOString(),
      },
    ]));

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /queue/i }));

    await waitFor(() => {
      expect(screen.getByText('Queued watch later video')).toBeInTheDocument();
    });
    expect(screen.queryByText('No favorite videos yet')).not.toBeInTheDocument();
  });

  it('removes queued videos once they are watched', async () => {
    mockWatchedVideos = new Set(['video-1']);
    localStorage.setItem('queued-video-ids', JSON.stringify(['video-1']));
    localStorage.setItem('queued-videos', JSON.stringify([
      {
        id: 'video-1',
        title: 'Watched queued video',
        description: '',
        thumbnail: 'https://example.com/video.jpg',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: new Date().toISOString(),
      },
    ]));

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /queue/i }));

    await waitFor(() => {
      expect(screen.getByText('Queue is empty')).toBeInTheDocument();
    });
    expect(JSON.parse(localStorage.getItem('queued-video-ids') || '[]')).toEqual([]);
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

  it('hides videos marked as Shorts even when the title has no Shorts text', () => {
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
        },
        {
          id: 'video-2',
          title: 'Harry Maguire Said NO',
          description: '',
          thumbnail: 'https://example.com/short.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
          isShort: true,
        },
      ],
    };

    render(<Dashboard />);

    expect(screen.getByText('Harry Maguire Said NO')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Shorts'));

    expect(screen.getByText('Normal upload')).toBeInTheDocument();
    expect(screen.queryByText('Harry Maguire Said NO')).not.toBeInTheDocument();
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

  it('filters latest videos by duration from the quality filters sheet', () => {
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-1',
          title: 'Quick update',
          description: '',
          thumbnail: 'https://example.com/quick.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
          duration: 8 * 60,
        },
        {
          id: 'video-2',
          title: 'Deep dive',
          description: '',
          thumbnail: 'https://example.com/deep.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
          duration: 22 * 60,
        },
      ],
    };

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Feed filters' }));
    fireEvent.click(screen.getByRole('button', { name: '10-30 min' }));

    expect(screen.queryByText('Quick update')).not.toBeInTheDocument();
    expect(screen.getByText('Deep dive')).toBeInTheDocument();
  });

  it('can hide livestream replays from Latest', () => {
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-1',
          title: 'Normal upload',
          description: '',
          thumbnail: 'https://example.com/normal.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
          duration: 12 * 60,
        },
        {
          id: 'video-2',
          title: 'Match livestream replay',
          description: '',
          thumbnail: 'https://example.com/live.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
          duration: 2 * 60 * 60,
        },
      ],
    };

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Feed filters' }));
    fireEvent.click(screen.getByLabelText('Hide livestream replays'));

    expect(screen.getByText('Normal upload')).toBeInTheDocument();
    expect(screen.queryByText('Match livestream replay')).not.toBeInTheDocument();
  });

  it('can mute latest videos by keyword from the quality filters sheet', () => {
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-1',
          title: 'Transfer rumor roundup',
          description: '',
          thumbnail: 'https://example.com/rumor.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
        },
        {
          id: 'video-2',
          title: 'Clean tactical analysis',
          description: '',
          thumbnail: 'https://example.com/tactics.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
        },
      ],
    };

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Feed filters' }));
    fireEvent.change(screen.getByLabelText('Mute keywords'), { target: { value: 'rumor' } });

    expect(screen.queryByText('Transfer rumor roundup')).not.toBeInTheDocument();
    expect(screen.getByText('Clean tactical analysis')).toBeInTheDocument();
  });

  it('can boost latest videos by keyword from the quality filters sheet', () => {
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-1',
          title: 'Regular upload',
          description: '',
          thumbnail: 'https://example.com/regular.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
        },
        {
          id: 'video-2',
          title: 'Linux deep dive',
          description: '',
          thumbnail: 'https://example.com/linux.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
        },
      ],
    };

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Feed filters' }));
    fireEvent.change(screen.getByLabelText('Boost keywords'), { target: { value: 'linux' } });

    const renderedText = document.body.textContent || '';
    expect(renderedText.indexOf('Linux deep dive')).toBeLessThan(renderedText.indexOf('Regular upload'));
  });

  it('can hide premieres and duplicate titles from the quality filters sheet', () => {
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-1',
          title: 'Normal upload',
          description: '',
          thumbnail: 'https://example.com/normal.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
        },
        {
          id: 'video-2',
          title: 'Product launch premiere',
          description: '',
          thumbnail: 'https://example.com/premiere.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
        },
        {
          id: 'video-3',
          title: 'Same News Story!',
          description: '',
          thumbnail: 'https://example.com/same-a.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
        },
        {
          id: 'video-4',
          title: 'Same news story',
          description: '',
          thumbnail: 'https://example.com/same-b.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date().toISOString(),
        },
      ],
    };

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Feed filters' }));
    fireEvent.click(screen.getByLabelText('Hide premieres'));
    fireEvent.click(screen.getByLabelText('Hide duplicate titles'));

    expect(screen.getByText('Normal upload')).toBeInTheDocument();
    expect(screen.queryByText('Product launch premiere')).not.toBeInTheDocument();
    expect(screen.getByText('Same News Story!')).toBeInTheDocument();
    expect(screen.queryByText('Same news story')).not.toBeInTheDocument();
  });

  it('persists quality filter settings across reloads', () => {
    localStorage.setItem('feed-quality-filters', JSON.stringify({
      durationFilter: '10-30',
      hideLiveReplays: true,
      hidePremieres: true,
      hideDuplicateTitles: true,
      mutedKeywordText: 'rumor',
      boostedKeywordText: 'linux',
    }));

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Feed filters' }));

    expect(screen.getByRole('button', { name: '10-30 min' }).className).toContain('bg-red-600');
    expect(screen.getByLabelText('Hide livestream replays')).toBeChecked();
    expect(screen.getByLabelText('Hide premieres')).toBeChecked();
    expect(screen.getByLabelText('Hide duplicate titles')).toBeChecked();
    expect(screen.getByLabelText('Mute keywords')).toHaveValue('rumor');
    expect(screen.getByLabelText('Boost keywords')).toHaveValue('linux');
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
