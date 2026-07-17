import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';
import { FEED_VIEW_PRESETS_CHANGED_EVENT } from '../lib/feed-view-presets';

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
  cacheStatus: {
    hasCache: boolean;
    isStale: boolean;
    age: number;
    videoCount: number;
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
  cacheStatus: {
    hasCache: false,
    isStale: false,
    age: 0,
    videoCount: 0,
  },
};

let mockSearchQuery = '';
let mockWatchedVideos = new Set<string>();
const mockMarkAsWatched = vi.fn((videoId: string) => {
  mockWatchedVideos = new Set([...mockWatchedVideos, videoId]);
});
const mockSetSearchQuery = vi.fn((query: string) => {
  mockSearchQuery = query;
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
let mockSubscriptionsInitialSyncing = false;
let mockSubscriptionsLoading = false;
let mockNeedsServerAuth = false;
const mockToggleChannelFavorite = vi.fn();
let throwSubscriptionsListError = false;
let latestSubscriptionsListProps: { selectedGroup?: string; groups?: string[] } | undefined;
type HeaderMockProps = {
  syncStatus?: MockRSSVideosState['syncStatus'];
  showShorts?: boolean;
  onToggleShorts?: () => void;
  hideWatched?: boolean;
  onToggleWatched?: () => void;
  scrollHidden?: boolean;
  compactMobile?: boolean;
};
const headerMockState = vi.hoisted(() => ({
  latestProps: undefined as undefined | HeaderMockProps,
}));
const toastMockState = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  message: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: toastMockState,
}));

vi.mock('./Header', () => ({
  Header: (props: HeaderMockProps) => {
    headerMockState.latestProps = props;
    return (
      <header>
        <span data-testid="header-mock">Header</span>
        {props.showShorts !== undefined && (
          <button
            type="button"
            aria-label={props.showShorts ? 'Hide Shorts' : 'Show Shorts'}
            data-testid="shorts-toggle"
            onClick={props.onToggleShorts}
          >
            Shorts
          </button>
        )}
        {props.hideWatched !== undefined && (
          <button
            type="button"
            aria-label={props.hideWatched ? 'Show Watched' : 'Hide Watched'}
            data-testid="watched-toggle"
            onClick={props.onToggleWatched}
          >
            Watched
          </button>
        )}
      </header>
    );
  },
}));

vi.mock('./SubscriptionsList', () => ({
  SubscriptionsList: (props: { selectedGroup?: string; groups?: string[] }) => {
    if (throwSubscriptionsListError) {
      throw new Error('Subscriptions list failed to render');
    }
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

vi.mock('./SettingsModal', () => ({
  SettingsModal: () => null,
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
    isInitialSyncing: mockSubscriptionsInitialSyncing,
    isLoading: mockSubscriptionsLoading,
    needsServerAuth: mockNeedsServerAuth,
  }),
}));

vi.mock('../store/useStore', () => ({
  useStore: () => ({
    searchQuery: mockSearchQuery,
    watchedVideos: mockWatchedVideos,
    markAsWatched: mockMarkAsWatched,
    setSearchQuery: mockSetSearchQuery,
  }),
}));

describe('Dashboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    mockSearchQuery = '';
    latestSubscriptionsListProps = undefined;
    headerMockState.latestProps = undefined;
    toastMockState.success.mockClear();
    toastMockState.error.mockClear();
    toastMockState.message.mockClear();
    mockWatchedVideos = new Set<string>();
    mockMarkAsWatched.mockClear();
    mockSetSearchQuery.mockClear();
    mockToggleChannelFavorite.mockClear();
    mockSubscriptionsInitialSyncing = false;
    mockSubscriptionsLoading = false;
    mockNeedsServerAuth = false;
    throwSubscriptionsListError = false;
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
      cacheStatus: {
        hasCache: false,
        isStale: false,
        age: 0,
        videoCount: 0,
      },
    };
  });

  it('opens on latest videos instead of subscription management', () => {
    render(<Dashboard />);

    expect(screen.getByText('No videos found')).toBeInTheDocument();
    expect(screen.queryByText('Subscriptions list content')).not.toBeInTheDocument();
  });

  it('hides Shorts by default and remembers the choice after remounting', () => {
    const { rerender } = render(<Dashboard />);

    expect(screen.getByTestId('shorts-toggle')).toHaveAttribute('aria-label', 'Show Shorts');
    expect(localStorage.getItem('feed-quality-filters')).toContain('"showShorts":false');

    rerender(<Dashboard />);

    expect(screen.getByTestId('shorts-toggle')).toHaveAttribute('aria-label', 'Show Shorts');
  });

  it('shows first-run onboarding when no subscriptions have been added', async () => {
    mockAllSubscriptions = [];

    render(<Dashboard />);

    expect(screen.getByText('MyTube')).toBeInTheDocument();
    expect(await screen.findByText('Import subscriptions')).toBeInTheDocument();
    expect(screen.getByText('Add a channel')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-tabs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('floating-tab-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('latest-toolbar')).not.toBeInTheDocument();
  });

  it('does not show onboarding while the initial server subscription sync is still running', () => {
    mockAllSubscriptions = [];
    mockSubscriptionsInitialSyncing = true;

    render(<Dashboard />);

    expect(screen.queryByTestId('first-run-onboarding')).not.toBeInTheDocument();
    expect(screen.queryByText('Start with your subscriptions')).not.toBeInTheDocument();
  });

  it('shows authentication recovery ahead of a still-pending subscription load', () => {
    mockSubscriptionsLoading = true;
    mockSubscriptionsInitialSyncing = true;
    mockNeedsServerAuth = true;

    render(<Dashboard />);

    expect(screen.getByTestId('auth-required')).toBeInTheDocument();
    expect(screen.getByText('Server authentication required')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-loading')).not.toBeInTheDocument();
  });

  it('uses a uniform icon empty state across empty timeline tabs', async () => {
    render(<Dashboard />);

    expect(screen.getByTestId('dashboard-empty-state')).toHaveAttribute('data-empty-icon', 'latest');
    expect(screen.getByText('No videos found')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /activity/i }));
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-empty-state')).toHaveAttribute('data-empty-icon', 'activity');
      expect(screen.getByText('No activity yet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /queue/i }));
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-empty-state')).toHaveAttribute('data-empty-icon', 'queue');
      expect(screen.getByText('Your queue is empty')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /faves/i }));
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-empty-state')).toHaveAttribute('data-empty-icon', 'favorites');
      expect(screen.getByText('No favorites yet')).toBeInTheDocument();
    });
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

  it('keeps navigation available when subscription content cannot render', async () => {
    throwSubscriptionsListError = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    window.history.replaceState(null, '', '/?tab=subscriptions');

    render(<Dashboard />);

    expect(screen.getByText('Header')).toBeInTheDocument();
    expect(screen.getByTestId('floating-tab-bar')).toBeInTheDocument();
    expect(screen.getByText('Subscriptions unavailable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Return to Latest' }));
    await waitFor(() => {
      expect(screen.getByText('No videos found')).toBeInTheDocument();
    });
  });

  it('clears the feed search when opening an activity channel', () => {
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
        total: 1,
        current: 1,
        videos: 1,
      },
    };
    mockSearchQuery = 'search term';

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /activity/i }));

    return screen.findByText('Test Channel').then(() => {
      fireEvent.click(screen.getByText('Test Channel'));

      expect(mockSetSearchQuery).toHaveBeenCalledWith('');
      expect(mockSearchQuery).toBe('');
    });
  });

  it('scrolls the active Latest timeline to the top after a double tap', () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_200);
    sessionStorage.setItem('latest-videos-scroll', '640');

    render(<Dashboard />);

    const latestTab = screen.getByRole('button', { name: /latest/i });
    fireEvent.click(latestTab);

    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('latest-videos-scroll')).toBe('640');

    fireEvent.click(latestTab);

    expect(sessionStorage.getItem('latest-videos-scroll')).toBeNull();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('does not show a feed build progress screen while syncing videos', () => {
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

    expect(screen.getByText('No videos found')).toBeInTheDocument();
    expect(screen.queryByText('Building your feed')).not.toBeInTheDocument();
    expect(screen.queryByText(/Your feeds are refreshing/i)).not.toBeInTheDocument();
    expect(screen.queryByText('70 / 261 channels checked')).not.toBeInTheDocument();
  });

  it('does not surface failed channel refreshes on the latest feed', () => {
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

    expect(screen.queryByText('1 channel needs attention')).not.toBeInTheDocument();
    expect(screen.queryByText('Broken Channel')).not.toBeInTheDocument();
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

  it('uses stable app chrome spacing with floating tab bar', () => {
    render(<Dashboard />);

    const pageChrome = screen.getByTestId('dashboard-page-chrome');
    const tabBar = screen.getByTestId('floating-tab-bar');
    const tabBarInner = screen.getByTestId('floating-tab-bar-inner');
    const addTab = screen.getByRole('button', { name: 'Add' });

    expect(pageChrome.className).toContain('pt-[var(--app-sticky-gap)]');
    expect(pageChrome.className).toContain('pb-[calc(5rem+env(safe-area-inset-bottom))]');
    expect(tabBar.className).toContain('fixed');
    expect(tabBar.className).toContain('bottom-0');
    expect(tabBar.className).toContain('z-50');
    expect(tabBar.className).toContain('pb-[var(--app-tab-bar-bottom-offset)]');
    expect(tabBarInner.className).toContain('max-w-7xl');
    // The Add action is rendered as a regular tab with a red icon
    const addIcon = addTab.querySelector('svg');
    const addIconClass = addIcon?.getAttribute('class') ?? '';
    expect(addIconClass).toMatch(/text-red-500|text-red-400/);
  });

  it('keeps the iPhone latest controls in one compact row', () => {
    render(<Dashboard />);

    const latestToolbar = screen.getByTestId('latest-toolbar');
    const latestActions = screen.getByTestId('latest-toolbar-actions');

    expect(latestToolbar.className).toContain('flex-nowrap');
    expect(latestToolbar.className).toContain('items-center');
    expect(latestToolbar.className).not.toContain('flex-col');
    expect(latestActions.className).toContain('flex-nowrap');
    expect(latestActions.className).toContain('shrink-0');
  });

  it('shows subscription group controls in the toolbar', async () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /subs/i }));

    const groupToolbar = screen.getByTestId('subscription-groups-toolbar');

    expect(groupToolbar.className).toContain('border-b');
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

  it('does not render pull-to-refresh controls', () => {
    render(<Dashboard />);

    expect(mockRSSVideosState.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText('Release to refresh')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-page-chrome')).toBeInTheDocument();
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

  it('keeps queued videos even when they are watched', async () => {
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
      expect(screen.getByText('Watched queued video')).toBeInTheDocument();
    });
    expect(JSON.parse(localStorage.getItem('queued-video-ids') || '[]')).toEqual(['video-1']);
  });

  it('splits the queue tab into Continue watching + Watch later', async () => {
    // 5h ago: user started video-1 (paused mid-watch — in Continue watching)
    // 3d ago: user queued video-2 (no progress — in Watch later)
    const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-1',
          title: 'Apple keynote paused mid-watch',
          description: '',
          thumbnail: 'https://example.com/v1.jpg',
          channelId: 'UC123',
          channelTitle: 'Apple',
          publishedAt: new Date(threeDaysAgo).toISOString(),
          duration: 600,
        },
        {
          id: 'video-2',
          title: 'Queued but not started',
          description: '',
          thumbnail: 'https://example.com/v2.jpg',
          channelId: 'UC456',
          channelTitle: 'Bloomberg',
          publishedAt: new Date(threeDaysAgo).toISOString(),
          duration: 900,
        },
      ],
    };

    localStorage.setItem('video-playback-progress', JSON.stringify({
      'video-1': { currentTime: 300, duration: 600, updatedAt: fiveHoursAgo },
    }));
    localStorage.setItem('queued-video-ids', JSON.stringify(['video-1', 'video-2']));
    localStorage.setItem('queued-videos', JSON.stringify([
      {
        id: 'video-1',
        title: 'Apple keynote paused mid-watch',
        description: '',
        thumbnail: 'https://example.com/v1.jpg',
        channelId: 'UC123',
        channelTitle: 'Apple',
        publishedAt: new Date(threeDaysAgo).toISOString(),
      },
      {
        id: 'video-2',
        title: 'Queued but not started',
        description: '',
        thumbnail: 'https://example.com/v2.jpg',
        channelId: 'UC456',
        channelTitle: 'Bloomberg',
        publishedAt: new Date(threeDaysAgo).toISOString(),
      },
    ]));

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));

    const continueSection = await screen.findByTestId('queue-continue-watching');
    const watchLaterSection = await screen.findByTestId('queue-watch-later');

    expect(continueSection).toHaveTextContent('Continue watching');
    expect(continueSection).toHaveTextContent('1 paused');
    expect(continueSection).toHaveTextContent('Apple keynote paused mid-watch');

    expect(watchLaterSection).toHaveTextContent('Watch later');
    expect(watchLaterSection).toHaveTextContent('1 saved');
    expect(watchLaterSection).toHaveTextContent('Queued but not started');
  });

  it('surfaces a 25s pause on a long video as Continue watching (not gated by 5% percent)', async () => {
    // Repro for the user-reported case: 25s of a 30-minute video is 1.4%,
    // which is well under any percent threshold but should still surface.
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-long',
          title: '30-minute video paused at 25s',
          description: '',
          thumbnail: 'https://example.com/long.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date(oneHourAgo).toISOString(),
          duration: 1800,
        },
      ],
    };

    localStorage.setItem('video-playback-progress', JSON.stringify({
      'video-long': { currentTime: 25, duration: 1800, updatedAt: oneHourAgo },
    }));

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));

    const continueSection = await screen.findByTestId('queue-continue-watching');
    expect(continueSection).toHaveTextContent('Continue watching');
    expect(continueSection).toHaveTextContent('1 paused');
    expect(continueSection).toHaveTextContent('30-minute video paused at 25s');
  });

  it('hides a video from Continue watching once the user removes it', async () => {
    // Repro for the user's follow-up: clicking trash in Continue watching
    // must mark the video as removed so it stays gone even if they watch
    // more of it later in Latest.
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-removed',
          title: 'Video marked removed',
          description: '',
          thumbnail: 'https://example.com/removed.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date(oneHourAgo).toISOString(),
          duration: 600,
        },
        {
          id: 'video-fresh',
          title: 'Unrelated fresh video',
          description: '',
          thumbnail: 'https://example.com/fresh.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date(oneHourAgo).toISOString(),
          duration: 600,
        },
      ],
    };

    // The removed video has both progress AND a fresh removedAt timestamp.
    // The other video has no progress at all, so it won't appear in
    // Continue watching regardless — keeps the section rendering.
    localStorage.setItem('video-playback-progress', JSON.stringify({
      'video-removed': {
        currentTime: 60,
        duration: 600,
        updatedAt: oneHourAgo,
        removedAt: Date.now(),
      },
    }));

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));

    // Wait for Queue tab to mount. With no in-progress videos, neither
    // section renders — we get the empty state instead.
    await screen.findByText('Your queue is empty');
    expect(screen.queryByText('Video marked removed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('queue-continue-watching')).not.toBeInTheDocument();
  });

  it('forgets a removed video once the grace window expires', async () => {
    // Edge case: user removed a video, then 6 months later comes back. We
    // don't want a stale flag to hide a video forever — the 30-day grace
    // window exists so storage cleanups don't permanently lose content.
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const ancient = Date.now() - 60 * 86_400_000; // 60 days ago

    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-ancient-removed',
          title: 'Removed ages ago',
          description: '',
          thumbnail: 'https://example.com/ancient.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date(oneHourAgo).toISOString(),
          duration: 600,
        },
      ],
    };

    localStorage.setItem('video-playback-progress', JSON.stringify({
      'video-ancient-removed': {
        currentTime: 60,
        duration: 600,
        updatedAt: oneHourAgo,
        removedAt: ancient,
      },
    }));

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));

    const continueSection = await screen.findByTestId('queue-continue-watching');
    expect(continueSection).toHaveTextContent('Removed ages ago');
  });

  it('does not surface sub-5s accidental taps as Continue watching', async () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'video-tap',
          title: 'I just tapped play for 2 seconds',
          description: '',
          thumbnail: 'https://example.com/tap.jpg',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: new Date(oneHourAgo).toISOString(),
          duration: 1800,
        },
      ],
    };

    localStorage.setItem('video-playback-progress', JSON.stringify({
      'video-tap': { currentTime: 2, duration: 1800, updatedAt: oneHourAgo },
    }));

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));

    // No videos, no sections, empty state shows.
    await waitFor(() => {
      expect(screen.getByText('Your queue is empty')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('queue-continue-watching')).not.toBeInTheDocument();
  });

  it('shows the saved favorite video records even before the feed has rebuilt', async () => {
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
    expect(screen.queryByText('Quick tip AJ#shorts')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('shorts-toggle'));

    expect(screen.getByText('Normal upload')).toBeInTheDocument();
    expect(screen.getByText('Quick tip AJ#shorts')).toBeInTheDocument();
  });

  it('hides the header after scrolling down past 8px', async () => {
    render(<Dashboard />);

    expect(headerMockState.latestProps?.scrollHidden).toBe(false);

    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 9,
    });
    fireEvent.scroll(window);

    await waitFor(() => {
      expect(headerMockState.latestProps?.scrollHidden).toBe(true);
    });
  });

  it('waits a little longer before hiding the header on compact mobile screens', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 844,
    });

    const firstRender = render(<Dashboard />);
    const firstHeaderProps = headerMockState.latestProps as HeaderMockProps | undefined;

    expect(firstHeaderProps?.compactMobile).toBe(true);
    expect(firstHeaderProps?.scrollHidden).toBe(false);

    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 10,
    });
    fireEvent.scroll(window);

    await waitFor(() => {
      expect(headerMockState.latestProps?.scrollHidden).toBe(false);
    });

    firstRender.unmount();
    headerMockState.latestProps = undefined;

    render(<Dashboard />);
    const secondHeaderProps = headerMockState.latestProps as HeaderMockProps | undefined;

    expect(secondHeaderProps?.compactMobile).toBe(true);

    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 25,
    });
    fireEvent.scroll(window);

    await waitFor(() => {
      expect(headerMockState.latestProps?.scrollHidden).toBe(true);
    });
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

    expect(screen.getByText('Normal upload')).toBeInTheDocument();
    expect(screen.queryByText('Harry Maguire Said NO')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('shorts-toggle'));

    expect(screen.getByText('Harry Maguire Said NO')).toBeInTheDocument();
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

    fireEvent.click(screen.getByTestId('watched-toggle'));

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

  it('does not add saved views when preset storage writes fail', async () => {
    const storageError = new Error('Storage quota exceeded');
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, _value: string) => {
      if (key === 'feed-view-presets') throw storageError;
    });
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [{
        id: 'video-1',
        title: 'Long update',
        description: '',
        thumbnail: '',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: new Date().toISOString(),
        duration: 60 * 40,
      }],
    };

    render(<Dashboard />);

    fireEvent.change(screen.getByLabelText('New saved view name'), { target: { value: 'Longform' } });
    fireEvent.click(screen.getByRole('button', { name: /save view/i }));

    expect(screen.queryByRole('option', { name: 'Longform' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('New saved view name')).toHaveValue('Longform');
    expect(toastMockState.error).toHaveBeenCalledWith('Could not save view', {
      description: 'Storage quota exceeded',
    });
  });

  it('refreshes saved feed view presets when backup restore updates local storage', async () => {
    render(<Dashboard />);

    expect(screen.queryByRole('option', { name: 'Restored view' })).not.toBeInTheDocument();

    localStorage.setItem('feed-view-presets', JSON.stringify([
      {
        id: 'restored-preset',
        name: 'Restored view',
        filters: {
          showShorts: false,
          hideWatched: true,
          durationFilter: '30-plus',
          hideLiveReplays: false,
          hidePremieres: false,
          hideDuplicateTitles: false,
          mutedKeywordText: '',
          boostedKeywordText: '',
        },
        createdAt: '2026-05-16T10:00:00.000Z',
        updatedAt: '2026-05-16T10:00:00.000Z',
      },
    ]));
    act(() => {
      window.dispatchEvent(new Event(FEED_VIEW_PRESETS_CHANGED_EVENT));
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Restored view' })).toBeInTheDocument();
    });
  });

  it('marks filtered videos older than 7 days as watched', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-05-16T00:00:00.000Z'));
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'old-video',
          title: 'Old video',
          description: '',
          thumbnail: '',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'new-video',
          title: 'New video',
          description: '',
          thumbnail: '',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: '2026-05-15T00:00:00.000Z',
        },
      ],
    };

    render(<Dashboard />);

    fireEvent.change(screen.getByLabelText('Bulk watched action'), { target: { value: 'older-7' } });

    expect(mockMarkAsWatched).toHaveBeenCalledWith('old-video');
    expect(mockMarkAsWatched).not.toHaveBeenCalledWith('new-video');
  });

  it('does not mark videos watched when older-than bulk action has no matches', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-05-16T00:00:00.000Z'));
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'new-video',
          title: 'New video',
          description: '',
          thumbnail: '',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: '2026-05-15T00:00:00.000Z',
        },
      ],
    };

    render(<Dashboard />);

    fireEvent.change(screen.getByLabelText('Bulk watched action'), { target: { value: 'older-7' } });

    expect(mockMarkAsWatched).not.toHaveBeenCalled();
    expect(toastMockState.message).toHaveBeenCalledWith('No matching videos to mark watched');
  });
});
