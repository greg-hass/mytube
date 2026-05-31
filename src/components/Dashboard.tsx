import { Component, lazy, Suspense, useState, useEffect, useMemo, useRef, type ErrorInfo, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Loader2, Activity, Heart, Image, ListVideo, X, Upload, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from './Header';
import { FloatingTabBar } from './FloatingTabBar';
import { PullToRefresh } from './PullToRefresh';
import { SubscriptionsList } from './SubscriptionsList';
import { SubscriptionCard } from './SubscriptionCard';
import { VirtualizedVideoGrid } from './VirtualizedVideoGrid';
import { EmptyState } from './EmptyState';
import { SavedFeedViews } from './SavedFeedViews';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useRSSVideos } from '../hooks/useRSSVideos';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';
import { useFavoriteVideos } from '../hooks/useFavoriteVideos';
import { useQueuedVideos } from '../hooks/useQueuedVideos';
import { useStore } from '../store/useStore';
import { buildVideoFeedIndex, filterIndexedVideos, type DurationFilter } from '../lib/video-feed-index';
import { createFeedViewPreset, FEED_VIEW_PRESETS_CHANGED_EVENT, readFeedViewPresets, writeFeedViewPresets, type FeedViewFilters, type FeedViewPreset } from '../lib/feed-view-presets';
import { getVideoIdsOlderThan, getVisibleVideoIds } from '../lib/feed-bulk-actions';
import {
  getVisibleTimelineVideos,
  MOBILE_TIMELINE_INCREMENT,
  MOBILE_TIMELINE_INITIAL_LIMIT,
} from '../lib/timeline-window';
import { getCurrentViewportSize, isCompactMobileViewport } from '../lib/mobile-viewport';
import { formatTimeAgo, formatRefreshAge } from '../lib/format';
import type { YouTubeChannel } from '../types/youtube';

type Tab = 'subscriptions' | 'latest' | 'queue' | 'activity' | 'favorites';
type FavoriteSection = 'channels' | 'videos';
const DASHBOARD_TABS: Tab[] = ['subscriptions', 'latest', 'queue', 'activity', 'favorites'];
const DEFAULT_TAB: Tab = 'latest';
const DURATION_FILTER_OPTIONS: Array<{ value: DurationFilter; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'under-10', label: 'Under 10 min' },
  { value: '10-30', label: '10-30 min' },
  { value: '30-plus', label: '30+ min' },
];
const QUALITY_FILTERS_STORAGE_KEY = 'feed-quality-filters';
const LATEST_TIMELINE_SCROLL_STORAGE_KEY = 'latest-videos-scroll';
const LATEST_DOUBLE_TAP_INTERVAL_MS = 350;

type PersistedQualityFilters = {
  durationFilter?: DurationFilter;
  hideLiveReplays?: boolean;
  hidePremieres?: boolean;
  hideDuplicateTitles?: boolean;
  mutedKeywordText?: string;
  boostedKeywordText?: string;
};

const isDurationFilter = (value: unknown): value is DurationFilter => {
  return value === 'any' || value === 'under-10' || value === '10-30' || value === '30-plus';
};

const readPersistedQualityFilters = (): PersistedQualityFilters => {
  if (typeof window === 'undefined') return {};

  try {
    const rawFilters = window.localStorage.getItem(QUALITY_FILTERS_STORAGE_KEY);
    if (!rawFilters) return {};
    const parsedFilters = JSON.parse(rawFilters) as PersistedQualityFilters;

    return {
      durationFilter: isDurationFilter(parsedFilters.durationFilter) ? parsedFilters.durationFilter : undefined,
      hideLiveReplays: Boolean(parsedFilters.hideLiveReplays),
      hidePremieres: Boolean(parsedFilters.hidePremieres),
      hideDuplicateTitles: Boolean(parsedFilters.hideDuplicateTitles),
      mutedKeywordText: typeof parsedFilters.mutedKeywordText === 'string' ? parsedFilters.mutedKeywordText : '',
      boostedKeywordText: typeof parsedFilters.boostedKeywordText === 'string' ? parsedFilters.boostedKeywordText : '',
    };
  } catch {
    return {};
  }
};

const isDashboardTab = (value: string | null): value is Tab => {
  return DASHBOARD_TABS.includes(value as Tab);
};

const readDashboardTabFromUrl = (): Tab => {
  if (typeof window === 'undefined') return DEFAULT_TAB;

  const tab = new URLSearchParams(window.location.search).get('tab');
  return isDashboardTab(tab) ? tab : DEFAULT_TAB;
};

const writeDashboardTabToUrl = (tab: Tab) => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
};

const AddChannelModal = lazy(() => import('./AddChannelModal').then((module) => ({ default: module.AddChannelModal })));
const OPMLUpload = lazy(() => import('./OPMLUpload').then((module) => ({ default: module.OPMLUpload })));

const getErrorDescription = (error: unknown) => error instanceof Error ? error.message : 'Unknown error';

class DashboardContentBoundary extends Component<{
  children: ReactNode;
  onReturnToLatest: () => void;
}, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error('Dashboard tab content failed to render:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="px-4 py-12 text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Subscriptions unavailable
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            This view could not be displayed. You can still use the rest of the app.
          </p>
          <button
            type="button"
            onClick={this.props.onReturnToLatest}
            className="mt-5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white dark:bg-gray-100 dark:text-gray-950"
          >
            Return to Latest
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const FirstRunOnboarding = ({ onAddChannel }: { onAddChannel: () => void }) => (
  <main data-testid="first-run-onboarding" className="mx-auto flex min-h-[80vh] max-w-2xl flex-col items-center justify-center px-4 py-10 sm:py-14">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="text-center"
    >
      {/* App Icon */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        className="mx-auto mb-6"
      >
        <img
          src="/icon-192.png"
          alt="YouTube RSS"
          className="mx-auto h-20 w-20 rounded-2xl shadow-2xl shadow-red-500/20 ring-2 ring-white/50 dark:ring-white/10"
        />
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-3xl font-bold tracking-tight text-gray-950 dark:text-gray-50 sm:text-4xl"
      >
        Welcome to YouTube RSS
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mx-auto mt-4 max-w-md text-base leading-relaxed text-gray-500 dark:text-gray-400"
      >
        Your personal YouTube subscription feed. No algorithms, no distractions — just the channels you care about.
      </motion.p>

      {/* Action Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-10 grid gap-4 sm:grid-cols-2"
      >
        <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20">
            <Upload className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Import subscriptions
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            Bring your existing subscriptions from Google Takeout or another RSS reader via OPML/XML.
          </p>
          <div className="mt-5">
            <Suspense fallback={null}>
              <OPMLUpload minimal showLabelOnMobile />
            </Suspense>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
            <Plus className="h-6 w-6 text-gray-700 dark:text-gray-300" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Add a channel
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            Paste a YouTube channel URL, handle, or channel ID to start following.
          </p>
          <button
            type="button"
            onClick={onAddChannel}
            className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-gray-900 px-5 text-sm font-semibold text-white transition-all hover:bg-gray-800 hover:shadow-lg active:scale-[0.98] dark:bg-gray-100 dark:text-gray-950 dark:hover:bg-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add channel
          </button>
        </div>
      </motion.div>

      {/* Subtle footer hint */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-8 text-xs text-gray-400 dark:text-gray-600"
      >
        Your feed will start refreshing automatically once channels are added.
      </motion.p>
    </motion.div>
  </main>
);

export const Dashboard = () => {
  const persistedQualityFilters = useMemo(() => readPersistedQualityFilters(), []);
  const [activeTab, setActiveTab] = useState<Tab>(() => readDashboardTabFromUrl());
  const [isAddChannelModalOpen, setIsAddChannelModalOpen] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showShorts, setShowShorts] = useState(true);
  const [hideWatched, setHideWatched] = useState(false);
  const [durationFilter, setDurationFilter] = useState<DurationFilter>(persistedQualityFilters.durationFilter || 'any');
  const [hideLiveReplays, setHideLiveReplays] = useState(Boolean(persistedQualityFilters.hideLiveReplays));
  const [hidePremieres, setHidePremieres] = useState(Boolean(persistedQualityFilters.hidePremieres));
  const [hideDuplicateTitles, setHideDuplicateTitles] = useState(Boolean(persistedQualityFilters.hideDuplicateTitles));
  const [mutedKeywordText, setMutedKeywordText] = useState(persistedQualityFilters.mutedKeywordText || '');
  const [boostedKeywordText, setBoostedKeywordText] = useState(persistedQualityFilters.boostedKeywordText || '');
  const [feedViewPresets, setFeedViewPresets] = useState<FeedViewPreset[]>(() => readFeedViewPresets());
  const [isQualityFiltersOpen, setIsQualityFiltersOpen] = useState(false);
  const [activeFavoriteSection, setActiveFavoriteSection] = useState<FavoriteSection>('channels');
  const [isMobileTimeline, setIsMobileTimeline] = useState(false);
  const [mobileVideoLimit, setMobileVideoLimit] = useState(MOBILE_TIMELINE_INITIAL_LIMIT);
  const [selectedSubscriptionGroup, setSelectedSubscriptionGroup] = useState('all');
  const [newSubscriptionGroupName, setNewSubscriptionGroupName] = useState('');
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);
  const [customSubscriptionGroups, setCustomSubscriptionGroups] = useState<string[]>([]);
  const [isRepairingIcons, setIsRepairingIcons] = useState(false);
  const lastActiveLatestTapAtRef = useRef<number | null>(null);
  const { allSubscriptions, addSubscriptions, rawSubscriptions, repairChannelIcons, toggleFavorite: toggleChannelFavorite, isLoading: subscriptionsLoading, isInitialSyncing: subscriptionsInitialSyncing } = useSubscriptionStorage();
  const { favoriteVideoIds, favoriteVideos: savedFavoriteVideos } = useFavoriteVideos();
  const { queuedVideoIds, queuedVideos: savedQueuedVideos } = useQueuedVideos();
  const { searchQuery, watchedVideos, markAsWatched } = useStore();

  // Check if any channels have temporary IDs (can't fetch videos)
  const hasTemporaryChannels = rawSubscriptions.some(sub =>
    sub.id.startsWith('handle_') || sub.id.startsWith('custom_')
  );

  const { videos, isLoading: videosLoading, refresh: refetchVideos, syncStatus, cacheStatus } = useRSSVideos();
  const hasNoSubscriptions = allSubscriptions.length === 0;
  const feedProgressPercent = syncStatus?.total
    ? Math.round((syncStatus.current / syncStatus.total) * 100)
    : 0;
  const channelThumbnails = useMemo(() => {
    return new Map(allSubscriptions.map((channel) => [channel.id, channel.thumbnail]));
  }, [allSubscriptions]);
  const subscriptionGroups = useMemo(() => {
    return Array.from(new Set([
      ...allSubscriptions
        .map((channel) => channel.group?.trim())
        .filter((group): group is string => Boolean(group)),
      ...customSubscriptionGroups,
    ])).sort((a, b) => a.localeCompare(b));
  }, [allSubscriptions, customSubscriptionGroups]);
  const videoFeedIndex = useMemo(() => {
    return buildVideoFeedIndex(videos, allSubscriptions);
  }, [videos, allSubscriptions]);
  const mutedKeywords = useMemo(() => {
    return mutedKeywordText.split(',').map((keyword) => keyword.trim()).filter(Boolean);
  }, [mutedKeywordText]);
  const boostedKeywords = useMemo(() => {
    return boostedKeywordText.split(',').map((keyword) => keyword.trim()).filter(Boolean);
  }, [boostedKeywordText]);

  const filteredVideos = useMemo(() => {
    return filterIndexedVideos(videoFeedIndex, {
      searchQuery,
      showShorts,
      durationFilter,
      hideLiveReplays,
      hidePremieres,
      hideDuplicateTitles,
      mutedKeywords,
      boostedKeywords,
    })
      .map((item) => item.video)
      .filter((video) => !hideWatched || !watchedVideos.has(video.id));
  }, [videoFeedIndex, showShorts, durationFilter, hideLiveReplays, hidePremieres, hideDuplicateTitles, mutedKeywords, boostedKeywords, searchQuery, hideWatched, watchedVideos]);

  const visibleLatestVideos = useMemo(() => {
    return getVisibleTimelineVideos(filteredVideos, {
      isMobile: isMobileTimeline,
      searchQuery,
      visibleCount: mobileVideoLimit,
    });
  }, [filteredVideos, isMobileTimeline, mobileVideoLimit, searchQuery]);

  // Calculate most active channels in the past week
  // Optimized to reduce re-renders and heavy calculations
  const activeChannels = useMemo(() => {
    if (videos.length === 0) return [];

    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    // Group videos by channel and count those from past week
    const channelActivity = new Map<string, { count: number; channel: YouTubeChannel; latestVideo: Date }>();

    // Only process recent videos to avoid iterating over thousands of old videos
    // Assuming videos are somewhat sorted by date, but we'll check the first 500 just in case
    const recentVideos = videos.slice(0, 1000);

    for (const video of recentVideos) {
      const videoDate = new Date(video.publishedAt).getTime();

      // If we hit videos older than a week and we've processed a fair amount, we can stop
      // (This assumes videos are sorted by date descending, which they usually are)
      if (videoDate < oneWeekAgo) continue;

      const existing = channelActivity.get(video.channelId);
      const channel = allSubscriptions.find(sub => sub.id === video.channelId);

      if (channel) {
        if (existing) {
          existing.count++;
          if (videoDate > existing.latestVideo.getTime()) {
            existing.latestVideo = new Date(videoDate);
          }
        } else {
          channelActivity.set(video.channelId, {
            count: 1,
            channel,
            latestVideo: new Date(videoDate)
          });
        }
      }
    }

    // Sort by count and take top 20
    return Array.from(channelActivity.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [videos, allSubscriptions]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'k',
      ctrl: true,
      description: 'Focus search',
      action: () => {
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
        searchInput?.focus();
      },
    },
    {
      key: 'n',
      ctrl: true,
      description: 'Add new channel',
      action: () => setIsAddChannelModalOpen(true),
    },
    {
      key: 'Escape',
      description: 'Close modal',
      action: () => {
        setIsAddChannelModalOpen(false);
        setShowShortcutsHelp(false);
      },
    },
    {
      key: '?',
      description: 'Show keyboard shortcuts',
      action: () => setShowShortcutsHelp(true),
    },
  ]);

  const favoriteVideos = useMemo(() => {
    const currentVideosById = new Map(videos.map((video) => [video.id, video]));
    const favoritesById = new Map(savedFavoriteVideos.map((video) => [
      video.id,
      currentVideosById.get(video.id) ?? video,
    ]));

    for (const video of videos) {
      if (favoriteVideoIds.has(video.id) && !favoritesById.has(video.id)) {
        favoritesById.set(video.id, video);
      }
    }

    return Array.from(favoritesById.values()).sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }, [videos, favoriteVideoIds, savedFavoriteVideos]);
  const favoriteChannels = useMemo(() => {
    return allSubscriptions.filter((channel) => channel.isFavorite);
  }, [allSubscriptions]);
  const visibleFavoriteSection = favoriteChannels.length > 0 || favoriteVideos.length === 0
    ? activeFavoriteSection
    : 'videos';

  const queuedVideos = useMemo(() => {
    const currentVideosById = new Map(videos.map((video) => [video.id, video]));
    const queuedById = new Map(savedQueuedVideos.map((video) => [
      video.id,
      currentVideosById.get(video.id) ?? video,
    ]));

    for (const video of videos) {
      if (queuedVideoIds.has(video.id) && !queuedById.has(video.id)) {
        queuedById.set(video.id, video);
      }
    }

    return Array.from(queuedById.values());
  }, [videos, queuedVideoIds, savedQueuedVideos]);

  const changeTab = (tab: Tab) => {
    setActiveTab(tab);
    writeDashboardTabToUrl(tab);

    if (tab === 'favorites') {
      sessionStorage.removeItem('favorite-videos-scroll');
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0 });
      });
    }

    if (tab === 'queue') {
      sessionStorage.removeItem('queued-videos-scroll');
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0 });
      });
    }
  };

  const handleLatestTabClick = () => {
    const now = Date.now();

    if (activeTab !== 'latest') {
      lastActiveLatestTapAtRef.current = null;
      changeTab('latest');
      return;
    }

    const lastTapAt = lastActiveLatestTapAtRef.current;
    if (lastTapAt !== null && now - lastTapAt <= LATEST_DOUBLE_TAP_INTERVAL_MS) {
      lastActiveLatestTapAtRef.current = null;
      sessionStorage.removeItem(LATEST_TIMELINE_SCROLL_STORAGE_KEY);
      window.scrollTo({ top: 0 });
    } else {
      lastActiveLatestTapAtRef.current = now;
    }

    changeTab('latest');
  };

  const createSubscriptionGroup = () => {
    const group = newSubscriptionGroupName.trim();
    if (!group) return;

    setCustomSubscriptionGroups((groups) => Array.from(new Set([...groups, group])).sort((a, b) => a.localeCompare(b)));
    setNewSubscriptionGroupName('');
    setIsNewGroupModalOpen(false);
    toast.success(`Created ${group} group`);
  };

  const handleRepairChannelIcons = async () => {
    setIsRepairingIcons(true);
    try {
      const repairedCount = await repairChannelIcons({ useApi: true });
      toast.success(
        repairedCount > 0
          ? `Updated ${repairedCount} channel icon${repairedCount === 1 ? '' : 's'}`
          : 'Channel icons are already up to date'
      );
    } catch (error) {
      toast.error('Could not repair channel icons', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsRepairingIcons(false);
    }
  };

  useEffect(() => {
    // Only log significant state changes for debugging
    // Uncomment for development debugging:
    // console.log('🎬 Dashboard mounted with', videos.length, 'videos');
  }, []); // Only run once on mount

  useEffect(() => {
    const updateMobileTimeline = () => {
      setIsMobileTimeline(isCompactMobileViewport(getCurrentViewportSize()));
    };

    updateMobileTimeline();

    window.addEventListener('resize', updateMobileTimeline, { passive: true });
    return () => window.removeEventListener('resize', updateMobileTimeline);
  }, []);

  useEffect(() => {
    setMobileVideoLimit(MOBILE_TIMELINE_INITIAL_LIMIT);
  }, [searchQuery, showShorts, hideWatched, durationFilter, hideLiveReplays, hidePremieres, hideDuplicateTitles, mutedKeywordText, boostedKeywordText]);

  useEffect(() => {
    window.localStorage.setItem(QUALITY_FILTERS_STORAGE_KEY, JSON.stringify({
      durationFilter,
      hideLiveReplays,
      hidePremieres,
      hideDuplicateTitles,
      mutedKeywordText,
      boostedKeywordText,
    }));
  }, [durationFilter, hideLiveReplays, hidePremieres, hideDuplicateTitles, mutedKeywordText, boostedKeywordText]);

  useEffect(() => {
    const syncFeedViewPresets = () => {
      setFeedViewPresets(readFeedViewPresets());
    };

    window.addEventListener(FEED_VIEW_PRESETS_CHANGED_EVENT, syncFeedViewPresets);
    return () => window.removeEventListener(FEED_VIEW_PRESETS_CHANGED_EVENT, syncFeedViewPresets);
  }, []);

  const activeQualityFilterCount = (durationFilter !== 'any' ? 1 : 0)
    + (hideLiveReplays ? 1 : 0)
    + (hidePremieres ? 1 : 0)
    + (hideDuplicateTitles ? 1 : 0)
    + (mutedKeywords.length > 0 ? 1 : 0)
    + (boostedKeywords.length > 0 ? 1 : 0);
  const clearQualityFilters = () => {
    setDurationFilter('any');
    setHideLiveReplays(false);
    setHidePremieres(false);
    setHideDuplicateTitles(false);
    setMutedKeywordText('');
    setBoostedKeywordText('');
  };

  const getCurrentFeedViewFilters = (): FeedViewFilters => ({
    showShorts,
    hideWatched,
    durationFilter,
    hideLiveReplays,
    hidePremieres,
    hideDuplicateTitles,
    mutedKeywordText,
    boostedKeywordText,
  });

  const applyFeedViewPreset = (preset: FeedViewPreset) => {
    setShowShorts(preset.filters.showShorts);
    setHideWatched(preset.filters.hideWatched);
    setDurationFilter(preset.filters.durationFilter);
    setHideLiveReplays(preset.filters.hideLiveReplays);
    setHidePremieres(preset.filters.hidePremieres);
    setHideDuplicateTitles(preset.filters.hideDuplicateTitles);
    setMutedKeywordText(preset.filters.mutedKeywordText);
    setBoostedKeywordText(preset.filters.boostedKeywordText);
    toast.success(`Applied ${preset.name}`);
  };

  const saveCurrentFeedViewPreset = (name: string) => {
    const preset = createFeedViewPreset({
      name,
      filters: getCurrentFeedViewFilters(),
    });

    try {
      const updatedPresets = writeFeedViewPresets([...feedViewPresets, preset]);
      setFeedViewPresets(updatedPresets);
      toast.success(`Saved ${preset.name}`);
      return true;
    } catch (error) {
      toast.error('Could not save view', {
        description: getErrorDescription(error),
      });
      return false;
    }
  };

  const deleteSavedFeedViewPreset = (presetId: string) => {
    const preset = feedViewPresets.find((candidate) => candidate.id === presetId);

    try {
      const updatedPresets = writeFeedViewPresets(feedViewPresets.filter((candidate) => candidate.id !== presetId));
      setFeedViewPresets(updatedPresets);
      if (preset) toast.success(`Deleted ${preset.name}`);
    } catch (error) {
      toast.error('Could not delete view', {
        description: getErrorDescription(error),
      });
    }
  };

  const markVideosWatched = (videoIds: string[]) => {
    if (videoIds.length === 0) {
      toast.message('No matching videos to mark watched');
      return;
    }

    videoIds.forEach((videoId) => markAsWatched(videoId));
    toast.success(`Marked ${videoIds.length} video${videoIds.length === 1 ? '' : 's'} watched`);
  };

  const handleBulkWatchedAction = (action: string) => {
    if (action === 'shown') {
      markVideosWatched(getVisibleVideoIds(visibleLatestVideos));
      return;
    }

    if (action === 'older-7') {
      markVideosWatched(getVideoIdsOlderThan(filteredVideos, { days: 7 }));
      return;
    }

    if (action === 'older-30') {
      markVideosWatched(getVideoIdsOlderThan(filteredVideos, { days: 30 }));
    }
  };



  const scheduledRefreshIntervalMinutes = syncStatus.scheduledRefresh?.enabled
    ? Math.round(syncStatus.scheduledRefresh.intervalMs / 60000)
    : null;

  const handleAddChannel = async (channel: YouTubeChannel) => {
    try {
      await addSubscriptions([{
        id: channel.id,
        title: channel.title,
        description: channel.description,
        thumbnail: channel.thumbnail,
        customUrl: channel.customUrl,
        addedAt: Date.now(),
      }]);
      toast.success(`Added ${channel.title}`, {
        description: 'Channel added to your subscriptions',
      });
    } catch (error) {
      console.error('Error adding channel:', error);
      toast.error('Failed to add channel', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
      throw error;
    }
  };

  return (
    <div className="app-shell min-h-screen">
      <Header
        showMobileSearch={activeTab === 'subscriptions' || activeTab === 'latest' || activeTab === 'queue'}
        searchPlaceholder={activeTab === 'latest' || activeTab === 'queue' ? 'Search videos...' : 'Search channels...'}
        syncStatus={syncStatus}
        cacheStatus={cacheStatus}
        onRetryFailed={refetchVideos}
        showShorts={showShorts}
        onToggleShorts={() => setShowShorts((prev) => !prev)}
        hideWatched={hideWatched}
        onToggleWatched={() => setHideWatched((prev) => !prev)}
        showFilters={activeTab === 'latest' || activeTab === 'queue' || activeTab === 'favorites'}
        onOpenFilters={() => setIsQualityFiltersOpen(true)}
        activeFilterCount={activeQualityFilterCount}
      />

      {subscriptionsLoading || subscriptionsInitialSyncing ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : hasNoSubscriptions ? (
        <FirstRunOnboarding onAddChannel={() => setIsAddChannelModalOpen(true)} />
      ) : (
        <div
          data-testid="dashboard-page-chrome"
          className="max-w-7xl mx-auto pt-[var(--app-sticky-gap)] pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-[calc(6rem+env(safe-area-inset-bottom))]"
        >
        {/* Toolbars */}
        <div className="px-4 pt-[var(--app-sticky-gap)] pb-[var(--app-sticky-gap)]">
          {activeTab === 'subscriptions' && (
            <div
              data-testid="subscription-groups-toolbar"
              className="flex items-start gap-2 border-b border-gray-200/70 pb-[var(--app-sticky-gap)] dark:border-gray-800/80 sm:items-center"
            >
              <div className="mr-auto flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <label htmlFor="subscription-group-filter" className="sr-only">Filter group</label>
                <select
                  id="subscription-group-filter"
                  aria-label="Filter group"
                  value={selectedSubscriptionGroup}
                  onChange={(e) => setSelectedSubscriptionGroup(e.target.value)}
                  className="h-10 max-w-[11rem] rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-red-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
                >
                  <option value="all">All groups</option>
                  {subscriptionGroups.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setIsNewGroupModalOpen(true)}
                  className="h-10 rounded-lg bg-gray-800 px-3 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
                >
                  Add group
                </button>
              </div>
              <button
                disabled={isRepairingIcons}
                onClick={handleRepairChannelIcons}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-gray-800 px-0 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-700 dark:hover:bg-gray-600 sm:w-auto sm:px-3"
                title="Repair icons"
              >
                {isRepairingIcons ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
                <span className="hidden sm:inline">{isRepairingIcons ? 'Repairing...' : 'Repair icons'}</span>
              </button>
            </div>
          )}

          {activeTab === 'latest' && (
            <div
              data-testid="latest-toolbar"
              className="flex flex-nowrap items-center justify-between gap-1 sm:gap-2"
            >
              <div className="flex min-w-0 flex-nowrap items-center gap-2 sm:gap-3">
                <div className="hidden items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 sm:flex">
                  <span>Last refreshed {formatRefreshAge(syncStatus.lastUpdated)}</span>
                  {scheduledRefreshIntervalMinutes && (
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      Auto {scheduledRefreshIntervalMinutes}m
                    </span>
                  )}
                </div>
              </div>

              <div data-testid="latest-toolbar-actions" className="ml-auto flex shrink-0 flex-nowrap items-center gap-1 sm:gap-2">
                <div className="hidden xl:flex">
                  <SavedFeedViews
                    presets={feedViewPresets}
                    onApply={applyFeedViewPreset}
                    onSave={saveCurrentFeedViewPreset}
                    onDelete={deleteSavedFeedViewPreset}
                  />
                </div>
                {visibleLatestVideos.length > 0 && (
                  <>
                    <label htmlFor="bulk-watched-action" className="sr-only">Bulk watched action</label>
                    <select
                      id="bulk-watched-action"
                      aria-label="Bulk watched action"
                      defaultValue=""
                      onChange={(event) => {
                        handleBulkWatchedAction(event.target.value);
                        event.target.value = '';
                      }}
                      className="hidden h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-red-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 sm:block"
                    >
                      <option value="" disabled>Mark watched</option>
                      <option value="shown">Shown videos</option>
                      <option value="older-7">Older than 7 days</option>
                      <option value="older-30">Older than 30 days</option>
                    </select>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <PullToRefresh
          onRefresh={() => {
            refetchVideos();
          }}
          isRefreshing={videosLoading || syncStatus?.isSyncing || false}
        >
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === 'subscriptions' ? (
            <motion.div
              key="subscriptions"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <DashboardContentBoundary onReturnToLatest={() => changeTab('latest')}>
                <SubscriptionsList
                  selectedGroup={selectedSubscriptionGroup}
                  groups={subscriptionGroups}
                />
              </DashboardContentBoundary>
            </motion.div>
          ) : activeTab === 'latest' ? (
            <motion.div
              key="latest"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="px-4"
            >
              {videos.length === 0 ? (
                videosLoading ? (
                  <div className="text-center py-12">
                    <div className="inline-block w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-gray-800 dark:text-gray-200 text-lg font-semibold">
                      Loading your feed
                    </p>
                  </div>
                ) : syncStatus?.isSyncing ? (
                  <div className="text-center py-12">
                    <div className="inline-block w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-gray-800 dark:text-gray-200 text-lg font-semibold">
                      Building your feed
                    </p>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      Your feeds are refreshing. This can take a minute after import.
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                      {syncStatus.current} / {syncStatus.total} channels checked
                    </p>
                    <div className="w-full max-w-sm h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden mx-auto mt-4">
                      <div
                        className="h-full bg-red-600 rounded-full transition-all"
                        style={{ width: `${feedProgressPercent}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                      {syncStatus.videos} videos found so far
                    </p>
                  </div>
                ) : hasTemporaryChannels ? (
                  <div className="text-center py-12">
                    <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
                      Some channels need channel IDs to fetch videos
                    </p>
                    <p className="text-sm text-gray-500">
                      Channels added with handles or custom names will be updated automatically when videos are discovered
                    </p>
                  </div>
                ) : (
                  <EmptyState
                    icon={TrendingUp}
                    iconName="latest"
                    title="No videos found"
                    detail="New uploads from your subscriptions will appear here."
                  />
                )
              ) : (
                <div>
                  <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Showing {filteredVideos.length} recent videos
                  </p>
                  <VirtualizedVideoGrid
                    videos={visibleLatestVideos}
                    columns={4}
                    scrollStorageKey="latest-videos-scroll"
                    channelThumbnails={channelThumbnails}
                  />
                  {visibleLatestVideos.length < filteredVideos.length && (
                    <div className="mt-4 flex justify-center pb-8 sm:hidden">
                      <button
                        type="button"
                        onClick={() => setMobileVideoLimit((count) => count + MOBILE_TIMELINE_INCREMENT)}
                        className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white dark:bg-gray-700"
                      >
                        Show older videos
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ) : activeTab === 'queue' ? (
            <motion.div
              key="queue"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="px-4"
            >
              {queuedVideos.length === 0 ? (
                <EmptyState
                  icon={ListVideo}
                  iconName="queue"
                  title="Your queue is empty"
                  detail="Add videos to your queue to watch them later."
                />
              ) : (
                <div>
                  <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400 mb-4">
                    {queuedVideos.length} video{queuedVideos.length !== 1 ? 's' : ''} queued
                  </p>
                  <VirtualizedVideoGrid
                    videos={queuedVideos}
                    columns={4}
                    scrollStorageKey="queued-videos-scroll"
                    channelThumbnails={channelThumbnails}
                  />
                </div>
              )}
            </motion.div>
          ) : activeTab === 'favorites' ? (
            <motion.div
              key="favorites"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="px-4"
            >
              {favoriteChannels.length === 0 && favoriteVideos.length === 0 ? (
                <EmptyState
                  icon={Heart}
                  iconName="favorites"
                  title="No favorites yet"
                  detail="Favorite channels or videos to find them here."
                />
              ) : (
                <div className="space-y-8">
                  {(favoriteChannels.length > 0 || favoriteVideos.length > 0) && (
                    <div
                      data-testid="favorite-section-switcher"
                      className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-900 sm:hidden"
                    >
                      <button
                        type="button"
                        aria-pressed={visibleFavoriteSection === 'channels'}
                        onClick={() => setActiveFavoriteSection('channels')}
                        className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${visibleFavoriteSection === 'channels'
                          ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-gray-50'
                          : 'text-gray-600 dark:text-gray-300'
                          }`}
                      >
                        Channels ({favoriteChannels.length})
                      </button>
                      <button
                        type="button"
                        aria-pressed={visibleFavoriteSection === 'videos'}
                        onClick={() => setActiveFavoriteSection('videos')}
                        className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${visibleFavoriteSection === 'videos'
                          ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-gray-50'
                          : 'text-gray-600 dark:text-gray-300'
                          }`}
                      >
                        Videos ({favoriteVideos.length})
                      </button>
                    </div>
                  )}

                  <section
                    data-testid="favorite-channels-section"
                    className={`${visibleFavoriteSection === 'channels' ? 'block' : 'hidden sm:block'} ${favoriteChannels.length === 0 ? 'sm:hidden' : ''}`}
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Channels
                      </h2>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {favoriteChannels.length}
                      </span>
                    </div>
                    {favoriteChannels.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                        No favorite channels yet
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 xl:grid-cols-5">
                        {favoriteChannels.map((channel, index) => (
                          <SubscriptionCard
                            key={channel.id}
                            channel={channel}
                            index={index}
                            groups={subscriptionGroups}
                            onToggleFavorite={async (channelId) => {
                              const channel = allSubscriptions.find(s => s.id === channelId);
                              await toggleChannelFavorite(channelId);
                              if (channel) {
                                toast.success(`Removed ${channel.title} from favorites`);
                              }
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </section>

                  <section
                    data-testid="favorite-videos-section"
                    className={`${visibleFavoriteSection === 'videos' ? 'block' : 'hidden sm:block'} ${favoriteVideos.length === 0 ? 'sm:hidden' : ''}`}
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Videos
                      </h2>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {favoriteVideos.length}
                      </span>
                    </div>
                    {favoriteVideos.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                        No favorite videos yet
                      </div>
                    ) : (
                      <VirtualizedVideoGrid
                        videos={favoriteVideos}
                        columns={4}
                        scrollStorageKey="favorite-videos-scroll"
                        channelThumbnails={channelThumbnails}
                      />
                    )}
                  </section>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="activity"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="px-4"
            >
              {activeChannels.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  iconName="activity"
                  title="No activity yet"
                  detail="Recent uploads from your channels will appear here."
                />
              ) : (
                <>
                  <div className="mb-4">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                      Most Active Channels
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Top {activeChannels.length} channels by uploads in the past 7 days
                    </p>
                  </div>
                  <div className="space-y-3">
                    {activeChannels.map((item, index) => (
                      <div
                        key={item.channel.id}
                        onClick={() => window.location.href = `/channel/${item.channel.id}`}
                        className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          #{index + 1}
                        </div>
                        <img
                          src={item.channel.thumbnail}
                          alt={item.channel.title}
                          className="w-16 h-16 rounded-full object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {item.channel.title}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {item.count} video{item.count !== 1 ? 's' : ''} this week
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Latest upload
                          </p>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {formatTimeAgo(item.latestVideo)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        </PullToRefresh>

        <FloatingTabBar
          activeTab={activeTab}
          onTabChange={(tab) => {
            if (tab === 'latest') {
              handleLatestTabClick();
            } else {
              changeTab(tab);
            }
          }}
          onAddChannel={() => setIsAddChannelModalOpen(true)}
          subscriptionCount={allSubscriptions.length}
          activeChannelCount={activeChannels.length}
          queueCount={queuedVideos.length}
          favoriteCount={favoriteChannels.length + favoriteVideos.length}
        />
      </div>
      )}

      {/* Add Channel Modal */}
      <Suspense fallback={null}>
        <AddChannelModal
          isOpen={isAddChannelModalOpen}
          onClose={() => setIsAddChannelModalOpen(false)}
          onAdd={handleAddChannel}
          existingSubscriptions={allSubscriptions}
        />
      </Suspense>

      {isNewGroupModalOpen && (
        <div className="fixed inset-0 z-[120]">
          <button
            type="button"
            aria-label="Close new group dialog"
            className="absolute inset-0 bg-gray-950/60"
            onClick={() => {
              setIsNewGroupModalOpen(false);
              setNewSubscriptionGroupName('');
            }}
          />
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-group-title"
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-800 dark:bg-gray-900 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-28 sm:w-96 sm:-translate-x-1/2 sm:rounded-xl sm:border"
            onSubmit={(event) => {
              event.preventDefault();
              createSubscriptionGroup();
            }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="new-group-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                New group
              </h2>
              <button
                type="button"
                aria-label="Close new group dialog"
                onClick={() => {
                  setIsNewGroupModalOpen(false);
                  setNewSubscriptionGroupName('');
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label htmlFor="new-subscription-group" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Group name
            </label>
            <input
              id="new-subscription-group"
              autoFocus
              value={newSubscriptionGroupName}
              onChange={(e) => setNewSubscriptionGroupName(e.target.value)}
              placeholder="Linux, News, Apple..."
              className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-base text-gray-900 outline-none focus:border-red-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
            />

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsNewGroupModalOpen(false);
                  setNewSubscriptionGroupName('');
                }}
                className="h-10 flex-1 rounded-lg bg-gray-100 px-3 text-sm font-medium text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-10 flex-1 rounded-lg bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700"
              >
                Create group
              </button>
            </div>
          </form>
        </div>
      )}

      {isQualityFiltersOpen && (
        <div className="fixed inset-0 z-[120]">
          <button
            type="button"
            aria-label="Close feed filters"
            className="absolute inset-0 bg-gray-950/60"
            onClick={() => setIsQualityFiltersOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feed-filters-title"
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-800 dark:bg-gray-900 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-28 sm:w-96 sm:-translate-x-1/2 sm:rounded-xl sm:border"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="feed-filters-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Feed filters
              </h2>
              <button
                type="button"
                aria-label="Close feed filters"
                onClick={() => setIsQualityFiltersOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Duration</p>
                <div className="grid grid-cols-2 gap-2">
                  {DURATION_FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDurationFilter(option.value)}
                      className={`h-10 rounded-lg px-3 text-sm font-medium transition-colors ${durationFilter === option.value
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700'
                        }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between gap-4 rounded-lg bg-gray-100 px-3 py-3 dark:bg-gray-800">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Hide livestream replays</span>
                <input
                  type="checkbox"
                  aria-label="Hide livestream replays"
                  checked={hideLiveReplays}
                  onChange={(event) => setHideLiveReplays(event.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500 dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label className="flex items-center justify-between gap-4 rounded-lg bg-gray-100 px-3 py-3 dark:bg-gray-800">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Hide premieres</span>
                <input
                  type="checkbox"
                  aria-label="Hide premieres"
                  checked={hidePremieres}
                  onChange={(event) => setHidePremieres(event.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500 dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <label className="flex items-center justify-between gap-4 rounded-lg bg-gray-100 px-3 py-3 dark:bg-gray-800">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Hide duplicate titles</span>
                <input
                  type="checkbox"
                  aria-label="Hide duplicate titles"
                  checked={hideDuplicateTitles}
                  onChange={(event) => setHideDuplicateTitles(event.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500 dark:border-gray-700 dark:bg-gray-900"
                />
              </label>

              <div className="space-y-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Mute keywords</span>
                  <input
                    type="text"
                    value={mutedKeywordText}
                    onChange={(event) => setMutedKeywordText(event.target.value)}
                    placeholder="rumor, spoiler"
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-red-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Boost keywords</span>
                  <input
                    type="text"
                    value={boostedKeywordText}
                    onChange={(event) => setBoostedKeywordText(event.target.value)}
                    placeholder="linux, tactics"
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-red-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                  />
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={clearQualityFilters}
                  className="h-10 flex-1 rounded-lg bg-gray-100 px-3 text-sm font-medium text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setIsQualityFiltersOpen(false)}
                  className="h-10 flex-1 rounded-lg bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />
    </div >
  );
};
