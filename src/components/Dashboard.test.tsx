import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';
import { FEED_VIEW_PRESETS_CHANGED_EVENT } from '../lib/feed-view-presets';
import { SUBSCRIPTION_GROUPS_STORAGE_KEY } from '../lib/subscription-groups';

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
const mockMarkAsUnwatched = vi.fn((videoId: string) => {
  mockWatchedVideos = new Set([...mockWatchedVideos].filter((id) => id !== videoId));
});
const mockSetSearchQuery = vi.fn((query: string) => {
  mockSearchQuery = query;
});
let mockAllSubscriptions: Array<{
	id: string;
	title: string;
	description: string;
	thumbnail: string;
	group: string;
	isFavorite: boolean;
	isMuted?: boolean;
}> = [
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
const mockToggleChannelMute = vi.fn();
const mockRemoveSubscription = vi.fn(async (_channelId: string) => {});
const mockSetSubscriptionGroup = vi.fn(async (_channelId: string, _group: string) => {});
let throwSubscriptionsListError = false;
let mockRawSubscriptions: Array<{
  id: string;
  title: string;
  addedAt: number;
  group?: string;
}> = [
  {
    id: 'UC123',
    title: 'Test Channel',
    addedAt: 0,
  },
];
const mockAddSubscriptions = vi.fn(async (newSubscriptions: Array<{ id: string; title: string }>) => {
  mockAllSubscriptions = [
    ...mockAllSubscriptions,
    ...newSubscriptions.map((subscription) => ({
      ...subscription,
      description: '',
      thumbnail: '',
      group: '',
      isFavorite: false,
    })),
  ];
});
const mockRestoreSubscriptions = vi.fn(async (_subscriptions: unknown[]) => {});
let latestSubscriptionsListProps: {
  selectedGroup?: string;
  groups?: string[];
  onClearGroup?: () => void;
  selectable?: boolean;
  selectedChannelIds?: ReadonlySet<string>;
  onToggleSelect?: (channelId: string) => void;
} | undefined;
type HeaderMockProps = {
  syncStatus?: MockRSSVideosState['syncStatus'];
  showShorts?: boolean;
  onToggleShorts?: () => void;
  hideWatched?: boolean;
  onToggleWatched?: () => void;
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
  SubscriptionsList: (props: {
    selectedGroup?: string;
    groups?: string[];
    onClearGroup?: () => void;
    selectable?: boolean;
    selectedChannelIds?: ReadonlySet<string>;
    onToggleSelect?: (channelId: string) => void;
  }) => {
    if (throwSubscriptionsListError) {
      throw new Error('Subscriptions list failed to render');
    }
    latestSubscriptionsListProps = props;
    return (
      <section>
        {props.selectable && props.onToggleSelect && mockAllSubscriptions.map((channel) => (
          <input
            key={channel.id}
            type="checkbox"
            checked={props.selectedChannelIds?.has(channel.id) ?? false}
            onChange={() => props.onToggleSelect?.(channel.id)}
            aria-label={`Select ${channel.title}`}
          />
        ))}
        Subscriptions list content
      </section>
    );
  },
}));

vi.mock('./VirtualizedVideoGrid', () => ({
  VirtualizedVideoGrid: ({
    videos,
    selectable,
    selectedVideoIds,
    onToggleSelect,
  }: {
    videos: Array<{ id: string; title: string }>;
    selectable?: boolean;
    selectedVideoIds?: ReadonlySet<string>;
    onToggleSelect?: (videoId: string) => void;
  }) => (
    <section>
      {videos.length === 0 ? 'Video grid content' : videos.map(video => (
        <article key={video.id}>
          {selectable && onToggleSelect && (
            <input
              type="checkbox"
              checked={selectedVideoIds?.has(video.id) ?? false}
              onChange={() => onToggleSelect(video.id)}
              aria-label={`Select ${video.title}`}
            />
          )}
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
  SubscriptionCard: ({
    channel,
    selectable,
    selected,
    onToggleSelect,
  }: {
    channel: { id: string; title: string };
    selectable?: boolean;
    selected?: boolean;
    onToggleSelect?: (channelId: string) => void;
  }) => (
    <article>
      {selectable && onToggleSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(channel.id)}
          aria-label={`Select ${channel.title}`}
        />
      )}
      {channel.title}
    </article>
  ),
}));

vi.mock('./AddChannelModal', () => ({
  AddChannelModal: ({ isOpen, onAdd }: { isOpen: boolean; onAdd: (channel: unknown) => void | Promise<void> }) => (
    isOpen ? (
      <div role="dialog" aria-label="Mock add channel dialog">
        <button
          type="button"
          onClick={() => void onAdd({
            id: 'UC_FIRST_CHANNEL',
            title: 'First Channel',
            description: '',
            thumbnail: '',
          })}
        >
          Mock add channel
        </button>
      </div>
    ) : null
  ),
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
    rawSubscriptions: mockRawSubscriptions,
    addSubscriptions: mockAddSubscriptions,
    restoreSubscriptions: mockRestoreSubscriptions,
    removeSubscription: mockRemoveSubscription,
    toggleFavorite: mockToggleChannelFavorite,
    toggleMute: mockToggleChannelMute,
    setSubscriptionGroup: mockSetSubscriptionGroup,
    repairChannelIcons: vi.fn(),
    isInitialSyncing: mockSubscriptionsInitialSyncing,
    isLoading: mockSubscriptionsLoading,
    needsServerAuth: mockNeedsServerAuth,
    clearServerAuth: vi.fn(),
  }),
}));

vi.mock('../store/useStore', () => ({
  useStore: () => ({
    searchQuery: mockSearchQuery,
    watchedVideos: mockWatchedVideos,
    markAsWatched: mockMarkAsWatched,
    markAsUnwatched: mockMarkAsUnwatched,
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
    mockMarkAsUnwatched.mockClear();
    mockSetSearchQuery.mockClear();
    mockToggleChannelFavorite.mockClear();
    mockToggleChannelMute.mockClear();
    mockRemoveSubscription.mockReset().mockResolvedValue(undefined);
    mockSetSubscriptionGroup.mockClear();
    mockAddSubscriptions.mockClear();
    mockRestoreSubscriptions.mockClear();
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
    mockRawSubscriptions = [
      {
        id: 'UC123',
        title: 'Test Channel',
        addedAt: 0,
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
		expect(screen.getAllByRole('button', { name: /add a channel/i })).toHaveLength(1);
		expect(screen.getByRole('heading', { name: 'How MyTube works' })).toBeInTheDocument();
	expect(screen.getByText('Strictly chronological — no algorithmic ranking.')).toBeInTheDocument();
		expect(screen.getByText('See which channels have posted recently.')).toBeInTheDocument();
		expect(screen.getByText('Keep saved channels and videos in one place.')).toBeInTheDocument();
		expect(screen.queryByTestId('dashboard-tabs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('floating-tab-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('latest-toolbar')).not.toBeInTheDocument();
  });

	it('closes the add modal and focuses the first-refresh guide after the first channel', async () => {
    mockAllSubscriptions = [];

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /add a channel/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Mock add channel' }));

    await waitFor(() => {
      expect(screen.getByTestId('first-refresh-guide')).toHaveFocus();
    });
    expect(screen.getByText('Preparing your first refresh')).toBeInTheDocument();
		expect(screen.queryByRole('dialog', { name: 'Mock add channel dialog' })).not.toBeInTheDocument();
	});

	it('keeps the first-refresh guide focused when the initial refresh needs attention', async () => {
		mockAllSubscriptions = [];
		const view = render(<Dashboard />);

		fireEvent.click(screen.getByRole('button', { name: /add a channel/i }));
		fireEvent.click(screen.getByRole('button', { name: 'Mock add channel' }));
		await waitFor(() => {
			expect(screen.getByTestId('first-refresh-guide')).toHaveFocus();
		});

		mockRSSVideosState = {
			...mockRSSVideosState,
			syncStatus: {
				...mockRSSVideosState.syncStatus,
				total: 1,
				current: 1,
				errors: 1,
				state: 'error',
			},
		};
		view.rerender(<Dashboard />);

		await waitFor(() => {
			expect(
				screen.getByRole('heading', { name: 'First refresh needs attention' }),
			).toBeInTheDocument();
			expect(screen.getByTestId('first-refresh-guide')).toHaveFocus();
		});
	});

	it('keeps the add modal open for subsequent channel additions', async () => {
		render(<Dashboard />);

		fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
		fireEvent.click(screen.getByRole('button', { name: 'Mock add channel' }));

		await waitFor(() => {
			expect(
				screen.getByRole('dialog', { name: 'Mock add channel dialog' }),
			).toBeInTheDocument();
		});
		expect(screen.queryByTestId('first-refresh-guide')).not.toBeInTheDocument();
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
    expect(screen.getByText('Connect to your MyTube server')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect to server' })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /faves/i }));
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-empty-state')).toHaveAttribute('data-empty-icon', 'favorites');
      expect(screen.getByText('No favorites yet')).toBeInTheDocument();
    });
  });

  it('provides useful actions from empty timeline states', async () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh feeds' }));
    expect(mockRSSVideosState.refresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /activity/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'View Latest' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'View Latest' }));
    await waitFor(() => {
      expect(screen.getByText('No videos found')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /faves/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Browse Latest' })).toBeInTheDocument();
    });
  });

  it('explains when filters hide the entire Latest feed and can clear them', () => {
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [{
        id: 'short-video',
        title: 'Short upload',
        description: '',
        thumbnail: '',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: new Date().toISOString(),
        duration: 5 * 60,
      }],
    };

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(screen.getByLabelText('Video duration'), {
      target: { value: '30-plus' },
    });

    expect(screen.getByText('No videos match your filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(screen.getByText('Short upload')).toBeInTheDocument();
  });

  it('shows deterministic recent channel activity without an unread badge', async () => {
    const now = Date.parse('2026-08-01T12:00:00.000Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    mockAllSubscriptions = [
      { id: 'UC_A', title: 'Alpha', description: '', thumbnail: '', group: '', isFavorite: false },
      { id: 'UC_B', title: 'Beta', description: '', thumbnail: '', group: '', isFavorite: false },
      { id: 'UC_C', title: 'Charlie', description: '', thumbnail: '', group: '', isFavorite: false },
    ];
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'alpha-1', title: 'Alpha 1', description: '', thumbnail: '', channelId: 'UC_A',
          channelTitle: 'Alpha', publishedAt: '2026-08-01T02:00:00.000Z',
        },
        {
          id: 'alpha-2', title: 'Alpha 2', description: '', thumbnail: '', channelId: 'UC_A',
          channelTitle: 'Alpha', publishedAt: '2026-07-31T12:00:00.000Z',
        },
        {
          id: 'beta-1', title: 'Beta 1', description: '', thumbnail: '', channelId: 'UC_B',
          channelTitle: 'Beta', publishedAt: '2026-08-01T10:00:00.000Z',
        },
        {
          id: 'charlie-1', title: 'Charlie 1', description: '', thumbnail: '', channelId: 'UC_C',
          channelTitle: 'Charlie', publishedAt: '2026-08-01T08:00:00.000Z',
        },
      ],
    };

    render(<Dashboard />);
    fireEvent.click(screen.getByRole('button', { name: /activity/i }));

    await waitFor(() => {
      expect(screen.getByText('Recent Channel Activity')).toBeInTheDocument();
    });

    expect(screen.getByText('3 channels with uploads in the past 7 days, ordered by volume and recency')).toBeInTheDocument();
    expect(screen.getAllByTestId('activity-channel-item').map((item) => item.getAttribute('data-channel-id'))).toEqual([
      'UC_A', 'UC_B', 'UC_C',
    ]);
    expect(screen.getByRole('button', { name: 'Activity' }).querySelector('.bg-red-500')).not.toBeInTheDocument();
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
    expect(latestSubscriptionsListProps).toEqual(expect.objectContaining({
      selectedGroup: 'all',
      groups: ['Tech'],
    }));
    });
  });

	it('creates subscription groups from a single toolbar dialog', async () => {
		const { unmount } = render(<Dashboard />);

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
			expect(latestSubscriptionsListProps).toEqual(expect.objectContaining({
				selectedGroup: 'all',
				groups: ['Linux', 'Tech'],
			}));
		});
		expect(JSON.parse(localStorage.getItem(SUBSCRIPTION_GROUPS_STORAGE_KEY) || '[]')).toEqual([
			'Linux',
		]);

		unmount();
		render(<Dashboard />);
		fireEvent.click(screen.getByRole('button', { name: /subs/i }));
		await waitFor(() => {
			expect(latestSubscriptionsListProps).toEqual(expect.objectContaining({
				selectedGroup: 'all',
				groups: ['Linux', 'Tech'],
			}));
		});
	});

	it('selects only channels visible in the active subscription group', async () => {
		mockAllSubscriptions = [
			{
				id: 'UC123',
				title: 'Tech Channel',
				description: '',
				thumbnail: '',
				group: 'Tech',
				isFavorite: false,
			},
			{
				id: 'UC456',
				title: 'Science Channel',
				description: '',
				thumbnail: '',
				group: 'Science',
				isFavorite: false,
			},
		];
		render(<Dashboard />);

		fireEvent.click(screen.getByRole('button', { name: /subs/i }));
		fireEvent.change(screen.getByLabelText('Filter group'), {
			target: { value: 'Tech' },
		});
		fireEvent.click(
			screen.getByRole('button', { name: 'Select all visible channels' }),
		);

		await waitFor(() => {
			expect(latestSubscriptionsListProps?.selectedChannelIds).toEqual(
				new Set(['UC123']),
			);
			expect(screen.getByText('1 selected')).toBeInTheDocument();
		});
		expect(
			screen.getByRole('button', { name: 'Deselect all visible channels' }),
		).toHaveAttribute('aria-pressed', 'true');

		fireEvent.click(
			screen.getByRole('button', { name: 'Deselect all visible channels' }),
		);
		await waitFor(() => {
			expect(screen.queryByTestId('bulk-selection-toolbar')).not.toBeInTheDocument();
		});
	});

	it('renames a custom group and keeps assigned channels in the new group', async () => {
		mockRawSubscriptions = [
			{
				id: 'UC123',
				title: 'Test Channel',
				group: 'Linux',
				addedAt: 0,
			},
		];
		render(<Dashboard />);

		fireEvent.click(screen.getByRole('button', { name: /subs/i }));
		fireEvent.click(screen.getByRole('button', { name: 'Add group' }));
		fireEvent.change(screen.getByLabelText('Group name'), {
			target: { value: 'Linux' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
		fireEvent.click(screen.getByRole('button', { name: 'Manage groups' }));
		fireEvent.click(screen.getByRole('button', { name: 'Rename Linux' }));

		expect(screen.getByLabelText('New group name')).toHaveFocus();
		fireEvent.change(screen.getByLabelText('New group name'), {
			target: { value: 'Engineering' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Rename group' }));

		await waitFor(() => {
			expect(mockSetSubscriptionGroup).toHaveBeenCalledWith(
				'UC123',
				'Engineering',
			);
			expect(
				JSON.parse(localStorage.getItem(SUBSCRIPTION_GROUPS_STORAGE_KEY) || '[]'),
			).toEqual(['Engineering']);
		});
	});

	it('confirms custom group deletion before ungrouping assigned channels', async () => {
		mockRawSubscriptions = [
			{
				id: 'UC123',
				title: 'Test Channel',
				group: 'Linux',
				addedAt: 0,
			},
		];
		render(<Dashboard />);

		fireEvent.click(screen.getByRole('button', { name: /subs/i }));
		fireEvent.click(screen.getByRole('button', { name: 'Add group' }));
		fireEvent.change(screen.getByLabelText('Group name'), {
			target: { value: 'Linux' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
		fireEvent.click(screen.getByRole('button', { name: 'Manage groups' }));
		fireEvent.click(screen.getByRole('button', { name: 'Delete Linux' }));

		expect(screen.getByText(/Your subscriptions will not be deleted/)).toBeInTheDocument();
		expect(mockSetSubscriptionGroup).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole('button', { name: 'Delete group' }));

		await waitFor(() => {
			expect(mockSetSubscriptionGroup).toHaveBeenCalledWith('UC123', '');
			expect(localStorage.getItem(SUBSCRIPTION_GROUPS_STORAGE_KEY)).toBe('[]');
		});
	});

	it('bulk assigns selected favourite channels to a group', async () => {
		localStorage.setItem(SUBSCRIPTION_GROUPS_STORAGE_KEY, JSON.stringify(['AI']));
		mockAllSubscriptions = [
			{
				id: 'UC123',
				title: 'Test Channel',
				description: '',
				thumbnail: '',
				group: 'Tech',
				isFavorite: true,
			},
		];
		render(<Dashboard />);

		fireEvent.click(screen.getByRole('button', { name: /faves/i }));
		fireEvent.click(screen.getByLabelText('Select Test Channel'));
		fireEvent.change(
			screen.getByRole('combobox', {
				name: 'Assign selected channels to group',
			}),
			{ target: { value: 'AI' } },
		);

		await waitFor(() => {
			expect(mockSetSubscriptionGroup).toHaveBeenCalledWith('UC123', 'AI');
			expect(screen.queryByTestId('bulk-selection-toolbar')).not.toBeInTheDocument();
		});
	});

	it('bulk assigns selected subscription channels to a group from Subs', async () => {
		localStorage.setItem(SUBSCRIPTION_GROUPS_STORAGE_KEY, JSON.stringify(['AI']));
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
		render(<Dashboard />);

		fireEvent.click(screen.getByRole('button', { name: /subs/i }));
		fireEvent.click(screen.getByLabelText('Select Test Channel'));
		fireEvent.change(
			screen.getByRole('combobox', {
				name: 'Assign selected channels to group',
			}),
			{ target: { value: 'AI' } },
		);

		await waitFor(() => {
			expect(mockSetSubscriptionGroup).toHaveBeenCalledWith('UC123', 'AI');
			expect(screen.queryByTestId('bulk-selection-toolbar')).not.toBeInTheDocument();
		});
	});

	it('bulk adds only unfavourited selected Subs channels to Favourites', async () => {
		mockAllSubscriptions = [
			{
				id: 'UC123',
				title: 'New Favourite',
				description: '',
				thumbnail: '',
				group: 'Tech',
				isFavorite: false,
			},
			{
				id: 'UC456',
				title: 'Already Favourite',
				description: '',
				thumbnail: '',
				group: 'Tech',
				isFavorite: true,
			},
		];
		render(<Dashboard />);

		fireEvent.click(screen.getByRole('button', { name: /subs/i }));
		fireEvent.click(
			screen.getByRole('button', { name: 'Select all visible channels' }),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Add to Favourites' }));

		await waitFor(() => {
			expect(mockToggleChannelFavorite).toHaveBeenCalledWith('UC123');
			expect(mockToggleChannelFavorite).not.toHaveBeenCalledWith('UC456');
			expect(screen.queryByTestId('bulk-selection-toolbar')).not.toBeInTheDocument();
		});
	});

	it('bulk mutes only unmuted selected Subs channels', async () => {
		mockAllSubscriptions = [
			{
				id: 'UC123',
				title: 'Needs Muting',
				description: '',
				thumbnail: '',
				group: 'Tech',
				isFavorite: false,
				isMuted: false,
			},
			{
				id: 'UC456',
				title: 'Already Muted',
				description: '',
				thumbnail: '',
				group: 'Tech',
				isFavorite: false,
				isMuted: true,
			},
		];
		render(<Dashboard />);

		fireEvent.click(screen.getByRole('button', { name: /subs/i }));
		fireEvent.click(
			screen.getByRole('button', { name: 'Select all visible channels' }),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Mute selected' }));

		await waitFor(() => {
			expect(mockToggleChannelMute).toHaveBeenCalledWith('UC123');
			expect(mockToggleChannelMute).not.toHaveBeenCalledWith('UC456');
			expect(screen.queryByTestId('bulk-selection-toolbar')).not.toBeInTheDocument();
		});
	});

	it('bulk unmutes only muted selected Subs channels', async () => {
		mockAllSubscriptions = [
			{
				id: 'UC123',
				title: 'Muted Channel',
				description: '',
				thumbnail: '',
				group: 'Tech',
				isFavorite: false,
				isMuted: true,
			},
			{
				id: 'UC456',
				title: 'Already Audible',
				description: '',
				thumbnail: '',
				group: 'Tech',
				isFavorite: false,
				isMuted: false,
			},
		];
		render(<Dashboard />);

		fireEvent.click(screen.getByRole('button', { name: /subs/i }));
		fireEvent.click(
			screen.getByRole('button', { name: 'Select all visible channels' }),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Unmute selected' }));

		await waitFor(() => {
			expect(mockToggleChannelMute).toHaveBeenCalledWith('UC123');
			expect(mockToggleChannelMute).not.toHaveBeenCalledWith('UC456');
			expect(screen.queryByTestId('bulk-selection-toolbar')).not.toBeInTheDocument();
		});
	});

	it('requires confirmation before bulk unsubscribe and offers undo', async () => {
		mockAllSubscriptions = [
			{
				id: 'UC123',
				title: 'First Channel',
				description: '',
				thumbnail: '',
				group: 'Tech',
				isFavorite: false,
			},
			{
				id: 'UC456',
				title: 'Second Channel',
				description: '',
				thumbnail: '',
				group: 'Tech',
				isFavorite: true,
			},
		];
		mockRawSubscriptions = [
			{ id: 'UC123', title: 'First Channel', addedAt: 1 },
			{ id: 'UC456', title: 'Second Channel', addedAt: 2, group: 'Tech' },
		];
		mockRemoveSubscription.mockImplementation(async (channelId: string) => {
			mockAllSubscriptions = mockAllSubscriptions.filter(
				(channel) => channel.id !== channelId,
			);
		});
		render(<Dashboard />);

		fireEvent.click(screen.getByRole('button', { name: /subs/i }));
		fireEvent.click(
			screen.getByRole('button', { name: 'Select all visible channels' }),
		);
		fireEvent.click(
			screen.getByRole('button', { name: 'Unsubscribe selected' }),
		);

		expect(
			screen.getByRole('dialog', { name: 'Unsubscribe selected channels?' }),
		).toBeInTheDocument();
		expect(mockRemoveSubscription).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe channels' }));
		await waitFor(() => {
			expect(mockRemoveSubscription).toHaveBeenNthCalledWith(1, 'UC123');
			expect(mockRemoveSubscription).toHaveBeenNthCalledWith(2, 'UC456');
			expect(toastMockState.success).toHaveBeenCalledWith(
				'Unsubscribed 2 channels',
				expect.objectContaining({
					action: expect.objectContaining({ label: 'Undo' }),
				}),
			);
		});

		const unsubscribeToast = toastMockState.success.mock.calls.find(
			([message]) => message === 'Unsubscribed 2 channels',
		);
		const undoAction = (
			unsubscribeToast?.[1] as {
				action?: { onClick?: () => Promise<void> };
			}
		)?.action?.onClick;
		expect(undoAction).toBeTypeOf('function');
		await act(async () => {
			await undoAction?.();
		});
		expect(mockRestoreSubscriptions).toHaveBeenCalledWith([
			expect.objectContaining({ id: 'UC123', addedAt: 1 }),
			expect.objectContaining({ id: 'UC456', addedAt: 2, group: 'Tech' }),
		]);
	});

	it('rolls back channels already removed when bulk unsubscribe fails', async () => {
		mockAllSubscriptions = [
			{
				id: 'UC123',
				title: 'First Channel',
				description: '',
				thumbnail: '',
				group: 'Tech',
				isFavorite: false,
			},
			{
				id: 'UC456',
				title: 'Second Channel',
				description: '',
				thumbnail: '',
				group: 'Tech',
				isFavorite: false,
			},
		];
		mockRawSubscriptions = [
			{ id: 'UC123', title: 'First Channel', addedAt: 1 },
			{ id: 'UC456', title: 'Second Channel', addedAt: 2 },
		];
		mockRemoveSubscription
			.mockImplementationOnce(async () => {
				mockAllSubscriptions = mockAllSubscriptions.filter(
					(channel) => channel.id !== 'UC123',
				);
			})
			.mockImplementationOnce(async () => {
				throw new Error('simulated unsubscribe failure');
			});
		render(<Dashboard />);

		fireEvent.click(screen.getByRole('button', { name: /subs/i }));
		fireEvent.click(
			screen.getByRole('button', { name: 'Select all visible channels' }),
		);
		fireEvent.click(
			screen.getByRole('button', { name: 'Unsubscribe selected' }),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe channels' }));

		await waitFor(() => {
			expect(mockRestoreSubscriptions).toHaveBeenCalledWith([
				expect.objectContaining({ id: 'UC123', addedAt: 1 }),
			]);
			expect(toastMockState.error).toHaveBeenCalledWith(
				'Could not unsubscribe selected channels',
				expect.objectContaining({ description: 'simulated unsubscribe failure' }),
			);
		});
	});

	it('rolls back completed channel assignments when a bulk group update fails', async () => {
		localStorage.setItem(SUBSCRIPTION_GROUPS_STORAGE_KEY, JSON.stringify(['AI']));
		mockAllSubscriptions = [
			{
				id: 'UC123',
				title: 'First Channel',
				description: '',
				thumbnail: '',
				group: 'Tech',
				isFavorite: true,
			},
			{
				id: 'UC456',
				title: 'Second Channel',
				description: '',
				thumbnail: '',
				group: 'Science',
				isFavorite: true,
			},
		];
		mockSetSubscriptionGroup
			.mockImplementationOnce(async () => {})
			.mockImplementationOnce(async () => {
				throw new Error('simulated group update failure');
			})
			.mockImplementationOnce(async () => {});
		render(<Dashboard />);

		fireEvent.click(screen.getByRole('button', { name: /faves/i }));
		fireEvent.click(screen.getByLabelText('Select First Channel'));
		fireEvent.click(screen.getByLabelText('Select Second Channel'));
		fireEvent.change(
			screen.getByRole('combobox', {
				name: 'Assign selected channels to group',
			}),
			{ target: { value: 'AI' } },
		);

		await waitFor(() => {
			expect(mockSetSubscriptionGroup).toHaveBeenNthCalledWith(1, 'UC123', 'AI');
			expect(mockSetSubscriptionGroup).toHaveBeenNthCalledWith(2, 'UC456', 'AI');
			expect(mockSetSubscriptionGroup).toHaveBeenNthCalledWith(3, 'UC123', 'Tech');
			expect(toastMockState.error).toHaveBeenCalledWith(
				'Could not update selected channels',
				expect.objectContaining({ description: 'simulated group update failure' }),
			);
		});
	});

  it('contains focus in the new group dialog and restores the add-group trigger', () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /subs/i }));
    const addGroupButton = screen.getByRole('button', { name: 'Add group' });
    addGroupButton.focus();
    fireEvent.click(addGroupButton);

    const dialog = screen.getByRole('dialog', { name: 'New group' });
    const groupNameInput = screen.getByLabelText('Group name');
    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    expect(groupNameInput).toHaveFocus();

    lastElement.focus();
    fireEvent.keyDown(lastElement, { key: 'Tab' });
    expect(firstElement).toHaveFocus();

    fireEvent.keyDown(firstElement, { key: 'Tab', shiftKey: true });
    expect(lastElement).toHaveFocus();

    fireEvent.keyDown(groupNameInput, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'New group' })).not.toBeInTheDocument();
    expect(addGroupButton).toHaveFocus();
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

	it('selects all visible favourite channels from the Faves section header', async () => {
		mockAllSubscriptions = [
			{
				id: 'UC123',
				title: 'First Favorite Channel',
				description: '',
				thumbnail: '',
				group: 'Tech',
				isFavorite: true,
			},
			{
				id: 'UC456',
				title: 'Second Favorite Channel',
				description: '',
				thumbnail: '',
				group: 'Science',
				isFavorite: true,
			},
		];
		render(<Dashboard />);

		fireEvent.click(screen.getByRole('button', { name: /faves/i }));
		await waitFor(() => {
			expect(
				screen.getByRole('button', { name: 'Select all visible channels' }),
			).toBeInTheDocument();
		});

		fireEvent.click(
			screen.getByRole('button', { name: 'Select all visible channels' }),
		);

		await waitFor(() => {
			expect(screen.getByRole('checkbox', { name: 'Select First Favorite Channel' })).toBeChecked();
			expect(screen.getByRole('checkbox', { name: 'Select Second Favorite Channel' })).toBeChecked();
			expect(screen.getByText('2 selected')).toBeInTheDocument();
		});
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

  it('applies bulk removal to selected Fave channels and videos', async () => {
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
      expect(screen.getByRole('checkbox', { name: 'Select Favorite Channel' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Select Favorite Video' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Favorite Channel' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Favorite Video' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Favourites' }));

    await waitFor(() => {
      expect(screen.queryByTestId('bulk-selection-toolbar')).not.toBeInTheDocument();
    });
    expect(mockToggleChannelFavorite).toHaveBeenCalledWith('UC123');
    expect(JSON.parse(localStorage.getItem('favorite-video-ids') || '[]')).toEqual([]);
  });

  it('removes Queue as a destination and normalizes legacy Queue links to Latest', async () => {
    window.history.replaceState(null, '', '/?tab=queue');

    render(<Dashboard />);

    expect(screen.getByRole('button', { name: 'Latest' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Queue' })).not.toBeInTheDocument();
    expect(screen.queryByText('Your queue is empty')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(window.location.search).toBe('?tab=latest');
    });
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
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
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

  it('flags compact mobile viewports to the header', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 844,
    });

    render(<Dashboard />);

    expect(headerMockState.latestProps?.compactMobile).toBe(true);
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

  it('opens advanced filters without changing Latest chronological order', () => {
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'newest-video',
          title: 'Newest long upload',
          description: '',
          thumbnail: '',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: '2026-05-16T10:00:00.000Z',
          duration: 40 * 60,
        },
        {
          id: 'middle-video',
          title: 'Middle length upload',
          description: '',
          thumbnail: '',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: '2026-05-16T09:00:00.000Z',
          duration: 20 * 60,
        },
        {
          id: 'oldest-video',
          title: 'Oldest long upload',
          description: '',
          thumbnail: '',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: '2026-05-16T08:00:00.000Z',
          duration: 50 * 60,
        },
      ],
    };

    render(<Dashboard />);

    expect(screen.getAllByRole('article').map((article) => article.querySelector('span')?.textContent)).toEqual([
      'Newest long upload',
      'Middle length upload',
      'Oldest long upload',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));

    expect(screen.getByRole('region', { name: 'Feed filters' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Video duration'), {
      target: { value: '30-plus' },
    });

    expect(screen.getByText('Newest long upload')).toBeInTheDocument();
    expect(screen.queryByText('Middle length upload')).not.toBeInTheDocument();
    expect(screen.getByText('Oldest long upload')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear advanced filters' }));

    expect(screen.getByText('Middle length upload')).toBeInTheDocument();
    expect(screen.getAllByRole('article').map((article) => article.querySelector('span')?.textContent)).toEqual([
      'Newest long upload',
      'Middle length upload',
      'Oldest long upload',
    ]);
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

  it('selects all visible Latest videos and marks only unwatched videos watched', async () => {
    mockWatchedVideos = new Set(['watched-video']);
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'watched-video',
          title: 'Already watched',
          description: '',
          thumbnail: '',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: '2026-05-15T00:00:00.000Z',
        },
        {
          id: 'unwatched-video',
          title: 'Needs watching',
          description: '',
          thumbnail: '',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: '2026-05-14T00:00:00.000Z',
        },
      ],
    };

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Select all visible videos' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark watched' }));

    await waitFor(() => {
      expect(mockMarkAsWatched).toHaveBeenCalledWith('unwatched-video');
      expect(mockMarkAsWatched).not.toHaveBeenCalledWith('watched-video');
      expect(screen.queryByTestId('bulk-selection-toolbar')).not.toBeInTheDocument();
    });
  });

  it('selects visible Latest videos and marks only watched videos unwatched', async () => {
    mockWatchedVideos = new Set(['watched-video']);
    mockRSSVideosState = {
      ...mockRSSVideosState,
      videos: [
        {
          id: 'watched-video',
          title: 'Already watched',
          description: '',
          thumbnail: '',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: '2026-05-15T00:00:00.000Z',
        },
        {
          id: 'unwatched-video',
          title: 'Still unread',
          description: '',
          thumbnail: '',
          channelId: 'UC123',
          channelTitle: 'Test Channel',
          publishedAt: '2026-05-14T00:00:00.000Z',
        },
      ],
    };

    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Select all visible videos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark unwatched' }));

    await waitFor(() => {
      expect(mockMarkAsUnwatched).toHaveBeenCalledWith('watched-video');
      expect(mockMarkAsUnwatched).not.toHaveBeenCalledWith('unwatched-video');
      expect(screen.queryByTestId('bulk-selection-toolbar')).not.toBeInTheDocument();
    });
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
