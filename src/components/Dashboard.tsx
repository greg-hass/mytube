import {
	Component,
	lazy,
	Suspense,
	useState,
	useEffect,
	useMemo,
	useRef,
	type ErrorInfo,
	type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	TrendingUp,
	Loader2,
	Activity,
	Heart,
	Image,
	ListVideo,
	X,
} from "lucide-react";
import { toast } from "sonner";
import { FirstRunOnboarding } from "./FirstRunOnboarding";
import { Header } from "./Header";
import { FloatingTabBar } from "./FloatingTabBar";
import { SubscriptionsList } from "./SubscriptionsList";
import { SubscriptionCard } from "./SubscriptionCard";
import { VirtualizedVideoGrid } from "./VirtualizedVideoGrid";
import { EmptyState } from "./EmptyState";
import { SavedFeedViews } from "./SavedFeedViews";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";
import { useRSSVideos } from "../hooks/useRSSVideos";
import { useSubscriptionStorage } from "../hooks/useSubscriptionStorage";
import { useFavoriteVideos } from "../hooks/useFavoriteVideos";
import { useQueuedVideos } from "../hooks/useQueuedVideos";
import { useStore } from "../store/useStore";
import {
	buildVideoFeedIndex,
	filterIndexedVideos,
	type DurationFilter,
} from "../lib/video-feed-index";
import {
	createFeedViewPreset,
	FEED_VIEW_PRESETS_CHANGED_EVENT,
	readFeedViewPresets,
	writeFeedViewPresets,
	type FeedViewFilters,
	type FeedViewPreset,
} from "../lib/feed-view-presets";
import {
	getVideoIdsOlderThan,
	getVisibleVideoIds,
} from "../lib/feed-bulk-actions";
import {
	getVisibleTimelineVideos,
	MOBILE_TIMELINE_INCREMENT,
	MOBILE_TIMELINE_INITIAL_LIMIT,
} from "../lib/timeline-window";
import {
	getCurrentViewportSize,
	isCompactMobileViewport,
} from "../lib/mobile-viewport";
import { formatTimeAgo, formatRefreshAge } from "../lib/format";
import { getAllVideoProgress } from "../lib/video-progress";
import type { YouTubeChannel, YouTubeVideo } from "../types/youtube";

type Tab = "subscriptions" | "latest" | "queue" | "activity" | "favorites";
type FavoriteSection = "channels" | "videos";
const TAB_LATEST: Tab = "latest";
const BTN = "button" as const;
const DASHBOARD_TABS: Tab[] = [
	"subscriptions",
	TAB_LATEST,
	"queue",
	"activity",
	"favorites",
];
const QUALITY_FILTERS_STORAGE_KEY = "feed-quality-filters";
const LATEST_TIMELINE_SCROLL_STORAGE_KEY = "latest-videos-scroll";
const LATEST_DOUBLE_TAP_INTERVAL_MS = 350;

type PersistedQualityFilters = {
	showShorts?: boolean;
	durationFilter?: DurationFilter;
	hideLiveReplays?: boolean;
	hidePremieres?: boolean;
	hideDuplicateTitles?: boolean;
	mutedKeywordText?: string;
	boostedKeywordText?: string;
};

const isDurationFilter = (value: unknown): value is DurationFilter => {
	return (
		value === "any" ||
		value === "under-10" ||
		value === "10-30" ||
		value === "30-plus"
	);
};

const readPersistedQualityFilters = (): PersistedQualityFilters => {
	if (typeof window === "undefined") return {};

	try {
		const rawFilters = window.localStorage.getItem(QUALITY_FILTERS_STORAGE_KEY);
		if (!rawFilters) return {};
		const parsedFilters = JSON.parse(rawFilters) as PersistedQualityFilters;

		return {
			showShorts:
				typeof parsedFilters.showShorts === "boolean"
					? parsedFilters.showShorts
					: false,
			durationFilter: isDurationFilter(parsedFilters.durationFilter)
				? parsedFilters.durationFilter
				: undefined,
			hideLiveReplays: Boolean(parsedFilters.hideLiveReplays),
			hidePremieres: Boolean(parsedFilters.hidePremieres),
			hideDuplicateTitles: Boolean(parsedFilters.hideDuplicateTitles),
			mutedKeywordText:
				typeof parsedFilters.mutedKeywordText === "string"
					? parsedFilters.mutedKeywordText
					: "",
			boostedKeywordText:
				typeof parsedFilters.boostedKeywordText === "string"
					? parsedFilters.boostedKeywordText
					: "",
		};
	} catch {
		return {};
	}
};

const isDashboardTab = (value: string | null): value is Tab => {
	return DASHBOARD_TABS.includes(value as Tab);
};

const readDashboardTabFromUrl = (): Tab => {
	if (typeof window === "undefined") return TAB_LATEST;

	const tab = new URLSearchParams(window.location.search).get("tab");
	return isDashboardTab(tab) ? tab : TAB_LATEST;
};

const writeDashboardTabToUrl = (tab: Tab) => {
	if (typeof window === "undefined") return;

	const url = new URL(window.location.href);
	url.searchParams.set("tab", tab);
	window.history.replaceState(
		window.history.state,
		"",
		`${url.pathname}${url.search}${url.hash}`,
	);
};

const AddChannelModal = lazy(() =>
	import("./AddChannelModal").then((module) => ({
		default: module.AddChannelModal,
	})),
);

const getErrorDescription = (error: unknown) =>
	error instanceof Error ? error.message : "Unknown error";

class DashboardContentBoundary extends Component<
	{
		children: ReactNode;
		onReturnToLatest: () => void;
	},
	{ hasError: boolean }
> {
	state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
		console.error("Dashboard tab content failed to render:", error, errorInfo);
		// Log additional details for debugging
		if (error instanceof Error) {
			console.error("Error stack:", error.stack);
		}
		// Report to console for easier debugging
		console.error("Error details:", {
			message: error instanceof Error ? error.message : String(error),
			componentStack: errorInfo.componentStack,
		});
	}

	render() {
		if (this.state.hasError) {
			return (
				<div className="px-4 py-12 text-center">
					<h2 className="text-xl font-semibold text-gray-900 dark:text-ios-100">
						Subscriptions unavailable
					</h2>
					<p className="mt-2 text-sm text-gray-500 dark:text-ios-400">
						This view could not be displayed. You can still use the rest of the
						app.
					</p>
					<button
						type={BTN}
						onClick={this.props.onReturnToLatest}
						className="mt-5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white dark:bg-ios-100 dark:text-ios-950"
					>
						Return to Latest
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}

export const Dashboard = () => {
	const persistedQualityFilters = useMemo(
		() => readPersistedQualityFilters(),
		[],
	);
	const [activeTab, setActiveTab] = useState<Tab>(() =>
		readDashboardTabFromUrl(),
	);
	const [isAddChannelModalOpen, setIsAddChannelModalOpen] = useState(false);
	const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
	const [showShorts, setShowShorts] = useState(
		Boolean(persistedQualityFilters.showShorts),
	);
	const [hideWatched, setHideWatched] = useState(false);
	const [durationFilter, setDurationFilter] = useState<DurationFilter>(
		persistedQualityFilters.durationFilter || "any",
	);
	const [hideLiveReplays, setHideLiveReplays] = useState(
		Boolean(persistedQualityFilters.hideLiveReplays),
	);
	const [hidePremieres, setHidePremieres] = useState(
		Boolean(persistedQualityFilters.hidePremieres),
	);
	const [hideDuplicateTitles, setHideDuplicateTitles] = useState(
		Boolean(persistedQualityFilters.hideDuplicateTitles),
	);
	const [mutedKeywordText, setMutedKeywordText] = useState(
		persistedQualityFilters.mutedKeywordText || "",
	);
	const [boostedKeywordText, setBoostedKeywordText] = useState(
		persistedQualityFilters.boostedKeywordText || "",
	);
	const [feedViewPresets, setFeedViewPresets] = useState<FeedViewPreset[]>(() =>
		readFeedViewPresets(),
	);
	const [activeFavoriteSection, setActiveFavoriteSection] =
		useState<FavoriteSection>("channels");
	const [isMobileTimeline, setIsMobileTimeline] = useState(false);
	const [mobileVideoLimit, setMobileVideoLimit] = useState(
		MOBILE_TIMELINE_INITIAL_LIMIT,
	);
	const [selectedSubscriptionGroup, setSelectedSubscriptionGroup] =
		useState("all");
	const [newSubscriptionGroupName, setNewSubscriptionGroupName] = useState("");
	const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);
	const [customSubscriptionGroups, setCustomSubscriptionGroups] = useState<
		string[]
	>([]);
	const [isRepairingIcons, setIsRepairingIcons] = useState(false);
	const [headerVisible, setHeaderVisible] = useState(true);
	const headerScrollYRef = useRef(0);
	const lastActiveLatestTapAtRef = useRef<number | null>(null);
	const {
		allSubscriptions,
		addSubscriptions,
		rawSubscriptions,
		repairChannelIcons,
		toggleFavorite: toggleChannelFavorite,
		isLoading: subscriptionsLoading,
		isInitialSyncing: subscriptionsInitialSyncing,
	} = useSubscriptionStorage();
	const { favoriteVideoIds, favoriteVideos: savedFavoriteVideos } =
		useFavoriteVideos();
	const { queuedVideoIds, queuedVideos: savedQueuedVideos } = useQueuedVideos();
	const { searchQuery, watchedVideos, markAsWatched, setSearchQuery } =
		useStore();

	// Re-render the queue when a video is started/resumed elsewhere in the app
	// (the video-progress-changed event fires from saveVideoProgress/clearVideoProgress).
	const [videoProgressVersion, setVideoProgressVersion] = useState(0);
	useEffect(() => {
		const handler = () => setVideoProgressVersion((version) => version + 1);
		window.addEventListener("video-progress-changed", handler);
		return () => window.removeEventListener("video-progress-changed", handler);
	}, []);

	// Check if any channels have temporary IDs (can't fetch videos)
	const hasTemporaryChannels = rawSubscriptions.some(
		(sub) => sub.id.startsWith("handle_") || sub.id.startsWith("custom_"),
	);

	const {
		videos,
		refresh: refetchVideos,
		syncStatus,
		cacheStatus,
	} = useRSSVideos();
	const hasNoSubscriptions = allSubscriptions.length === 0;
	const channelThumbnails = useMemo(() => {
		return new Map(
			allSubscriptions.map((channel) => [channel.id, channel.thumbnail]),
		);
	}, [allSubscriptions]);
	const subscriptionGroups = useMemo(() => {
		return Array.from(
			new Set([
				...allSubscriptions
					.map((channel) => channel.group?.trim())
					.filter((group): group is string => Boolean(group)),
				...customSubscriptionGroups,
			]),
		).sort((a, b) => a.localeCompare(b));
	}, [allSubscriptions, customSubscriptionGroups]);
	const videoFeedIndex = useMemo(() => {
		return buildVideoFeedIndex(videos, allSubscriptions);
	}, [videos, allSubscriptions]);
	const mutedKeywords = useMemo(() => {
		return mutedKeywordText
			.split(",")
			.map((keyword) => keyword.trim())
			.filter(Boolean);
	}, [mutedKeywordText]);
	const boostedKeywords = useMemo(() => {
		return boostedKeywordText
			.split(",")
			.map((keyword) => keyword.trim())
			.filter(Boolean);
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
	}, [
		videoFeedIndex,
		showShorts,
		durationFilter,
		hideLiveReplays,
		hidePremieres,
		hideDuplicateTitles,
		mutedKeywords,
		boostedKeywords,
		searchQuery,
		hideWatched,
		watchedVideos,
	]);

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

		const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

		// Group videos by channel and count those from past week
		const channelActivity = new Map<
			string,
			{ count: number; channel: YouTubeChannel; latestVideo: Date }
		>();

		// Only process recent videos to avoid iterating over thousands of old videos
		// Assuming videos are somewhat sorted by date, but we'll check the first 500 just in case
		const recentVideos = videos.slice(0, 1000);
		const channelById = new Map(allSubscriptions.map((sub) => [sub.id, sub]));

		for (const video of recentVideos) {
			const videoDate = new Date(video.publishedAt).getTime();

			// If we hit videos older than a week and we've processed a fair amount, we can stop
			// (This assumes videos are sorted by date descending, which they usually are)
			if (videoDate < oneWeekAgo) continue;

			const existing = channelActivity.get(video.channelId);
			const channel = channelById.get(video.channelId);

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
						latestVideo: new Date(videoDate),
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
			key: "k",
			ctrl: true,
			description: "Focus search",
			action: () => {
				const searchInput = document.querySelector(
					'input[type="text"]',
				) as HTMLInputElement;
				searchInput?.focus();
			},
		},
		{
			key: "n",
			ctrl: true,
			description: "Add new channel",
			action: () => setIsAddChannelModalOpen(true),
		},
		{
			key: "Escape",
			description: "Close modal",
			action: () => {
				setIsAddChannelModalOpen(false);
				setShowShortcutsHelp(false);
			},
		},
		{
			key: "?",
			description: "Show keyboard shortcuts",
			action: () => setShowShortcutsHelp(true),
		},
	]);

	const favoriteVideos = useMemo(() => {
		const currentVideosById = new Map(videos.map((video) => [video.id, video]));
		const favoritesById = new Map(
			savedFavoriteVideos.map((video) => [
				video.id,
				currentVideosById.get(video.id) ?? video,
			]),
		);

		for (const video of videos) {
			if (favoriteVideoIds.has(video.id) && !favoritesById.has(video.id)) {
				favoritesById.set(video.id, video);
			}
		}

		return Array.from(favoritesById.values()).sort(
			(a, b) =>
				new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
		);
	}, [videos, favoriteVideoIds, savedFavoriteVideos]);
	const favoriteChannels = useMemo(() => {
		return allSubscriptions.filter((channel) => channel.isFavorite);
	}, [allSubscriptions]);
	const visibleFavoriteSection =
		favoriteChannels.length > 0 || favoriteVideos.length === 0
			? activeFavoriteSection
			: "videos";

	const queuedVideos = useMemo(() => {
		const currentVideosById = new Map(videos.map((video) => [video.id, video]));
		const queuedById = new Map(
			savedQueuedVideos.map((video) => [
				video.id,
				currentVideosById.get(video.id) ?? video,
			]),
		);

		for (const video of videos) {
			if (queuedVideoIds.has(video.id) && !queuedById.has(video.id)) {
				queuedById.set(video.id, video);
			}
		}

		return Array.from(queuedById.values());
	}, [videos, queuedVideoIds, savedQueuedVideos]);

	// Continue watching: videos the user has started but not finished.
	// Sorted by oldest-paused first so forgotten pauses bubble to the top.
	// Reads the progress store once (not per-video) to keep it cheap on big feeds.
	// 5s absolute floor ignores accidental 1-2s taps without losing real watches.
	// Videos the user explicitly removed from this section are skipped until
	// either they re-engage in Latest (saveVideoProgress drops the flag) or
	// the grace window expires — so a remove gesture sticks even if the user
	// happens to watch another few seconds later.
	const REMOVED_GRACE_DAYS = 30;
	const inProgressVideos = useMemo(() => {
		if (videos.length === 0) return [];

		const progressStore = getAllVideoProgress();
		const now = Date.now();
		const graceCutoff = now - REMOVED_GRACE_DAYS * 86_400_000;
		const withProgress: { video: YouTubeVideo; updatedAt: number }[] = [];

		for (const video of videos) {
			const progress = progressStore[video.id];
			if (!progress) continue;
			if (
				typeof progress.currentTime !== "number" ||
				typeof progress.duration !== "number" ||
				progress.duration <= 0
			) {
				continue;
			}
			// 5s floor — captures anything you actually watched, ignores
			// accidental taps. saveVideoProgress already auto-clears at
			// 95% / within 10s of end, so we don't need an upper bound here.
			if (progress.currentTime < 5) continue;
			// Honor explicit user removal. saveVideoProgress will clear the
			// flag the next time the user resumes the video in Latest, so
			// re-engagement is intentional, not accidental.
			if (progress.removedAt && progress.removedAt > graceCutoff) continue;
			withProgress.push({ video, updatedAt: progress.updatedAt ?? 0 });
		}

		withProgress.sort((a, b) => a.updatedAt - b.updatedAt);
		return withProgress.map((entry) => entry.video);
		// videoProgressVersion is the trigger for re-reading the progress store
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [videos, videoProgressVersion]);

	// Watch later: queued videos that aren't in Continue watching. Already
	// in queue-add order (oldest first) from useQueuedVideos.
	const watchLaterVideos = useMemo(() => {
		if (queuedVideos.length === 0) return [];
		if (inProgressVideos.length === 0) return queuedVideos;
		const inProgressIds = new Set(inProgressVideos.map((video) => video.id));
		return queuedVideos.filter((video) => !inProgressIds.has(video.id));
	}, [queuedVideos, inProgressVideos]);

	const changeTab = (tab: Tab) => {
		setActiveTab(tab);
		writeDashboardTabToUrl(tab);

		if (tab === "favorites") {
			sessionStorage.removeItem("favorite-videos-scroll");
			requestAnimationFrame(() => {
				window.scrollTo({ top: 0 });
			});
		}

		if (tab === "queue") {
			sessionStorage.removeItem("queued-videos-scroll");
			requestAnimationFrame(() => {
				window.scrollTo({ top: 0 });
			});
		}
	};

	const handleLatestTabClick = () => {
		const now = Date.now();

		if (activeTab !== TAB_LATEST) {
			lastActiveLatestTapAtRef.current = null;
			changeTab(TAB_LATEST);
			return;
		}

		const lastTapAt = lastActiveLatestTapAtRef.current;
		if (
			lastTapAt !== null &&
			now - lastTapAt <= LATEST_DOUBLE_TAP_INTERVAL_MS
		) {
			lastActiveLatestTapAtRef.current = null;
			sessionStorage.removeItem(LATEST_TIMELINE_SCROLL_STORAGE_KEY);
			window.scrollTo({ top: 0 });
		} else {
			lastActiveLatestTapAtRef.current = now;
		}

		changeTab(TAB_LATEST);
	};

	const createSubscriptionGroup = () => {
		const group = newSubscriptionGroupName.trim();
		if (!group) return;

		setCustomSubscriptionGroups((groups) =>
			Array.from(new Set([...groups, group])).sort((a, b) =>
				a.localeCompare(b),
			),
		);
		setNewSubscriptionGroupName("");
		setIsNewGroupModalOpen(false);
		toast.success(`Created ${group} group`);
	};

	const handleRepairChannelIcons = async () => {
		setIsRepairingIcons(true);
		try {
			const repairedCount = await repairChannelIcons({ useApi: true });
			toast.success(
				repairedCount > 0
					? `Updated ${repairedCount} channel icon${repairedCount === 1 ? "" : "s"}`
					: "Channel icons are already up to date",
			);
		} catch (error) {
			toast.error("Could not repair channel icons", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setIsRepairingIcons(false);
		}
	};

	const openChannel = (channelId: string) => {
		setSearchQuery("");
		window.location.href = `/channel/${channelId}`;
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

		window.addEventListener("resize", updateMobileTimeline, { passive: true });
		return () => window.removeEventListener("resize", updateMobileTimeline);
	}, []);

	useEffect(() => {
		setMobileVideoLimit(MOBILE_TIMELINE_INITIAL_LIMIT);
	}, [
		searchQuery,
		showShorts,
		hideWatched,
		durationFilter,
		hideLiveReplays,
		hidePremieres,
		hideDuplicateTitles,
		mutedKeywordText,
		boostedKeywordText,
	]);

	useEffect(() => {
		window.localStorage.setItem(
			QUALITY_FILTERS_STORAGE_KEY,
			JSON.stringify({
				showShorts,
				durationFilter,
				hideLiveReplays,
				hidePremieres,
				hideDuplicateTitles,
				mutedKeywordText,
				boostedKeywordText,
			}),
		);
	}, [
		showShorts,
		durationFilter,
		hideLiveReplays,
		hidePremieres,
		hideDuplicateTitles,
		mutedKeywordText,
		boostedKeywordText,
	]);

	useEffect(() => {
		const syncFeedViewPresets = () => {
			setFeedViewPresets(readFeedViewPresets());
		};

		window.addEventListener(
			FEED_VIEW_PRESETS_CHANGED_EVENT,
			syncFeedViewPresets,
		);
		return () =>
			window.removeEventListener(
				FEED_VIEW_PRESETS_CHANGED_EVENT,
				syncFeedViewPresets,
			);
	}, []);

	useEffect(() => {
		let ticking = false;

		const onScroll = () => {
			if (!ticking) {
				requestAnimationFrame(() => {
					const currentY = window.scrollY;
					const delta = currentY - headerScrollYRef.current;
					const compactMobile = isCompactMobileViewport(
						getCurrentViewportSize(),
					);
					const headerHideThreshold = compactMobile ? 12 : 8;
					const headerShowThreshold = compactMobile ? -5 : -3;

					if (currentY < headerHideThreshold) {
						setHeaderVisible(true);
					} else if (delta > headerHideThreshold) {
						setHeaderVisible(false);
					} else if (delta < headerShowThreshold) {
						setHeaderVisible(true);
					}

					headerScrollYRef.current = currentY;
					ticking = false;
				});
				ticking = true;
			}
		};

		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

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
			toast.error("Could not save view", {
				description: getErrorDescription(error),
			});
			return false;
		}
	};

	const deleteSavedFeedViewPreset = (presetId: string) => {
		const preset = feedViewPresets.find(
			(candidate) => candidate.id === presetId,
		);

		try {
			const updatedPresets = writeFeedViewPresets(
				feedViewPresets.filter((candidate) => candidate.id !== presetId),
			);
			setFeedViewPresets(updatedPresets);
			if (preset) toast.success(`Deleted ${preset.name}`);
		} catch (error) {
			toast.error("Could not delete view", {
				description: getErrorDescription(error),
			});
		}
	};

	const markVideosWatched = (videoIds: string[]) => {
		if (videoIds.length === 0) {
			toast.message("No matching videos to mark watched");
			return;
		}

		videoIds.forEach((videoId) => markAsWatched(videoId));
		toast.success(
			`Marked ${videoIds.length} video${videoIds.length === 1 ? "" : "s"} watched`,
		);
	};

	const handleBulkWatchedAction = (action: string) => {
		if (action === "shown") {
			markVideosWatched(getVisibleVideoIds(visibleLatestVideos));
			return;
		}

		if (action === "older-7") {
			markVideosWatched(getVideoIdsOlderThan(filteredVideos, { days: 7 }));
			return;
		}

		if (action === "older-30") {
			markVideosWatched(getVideoIdsOlderThan(filteredVideos, { days: 30 }));
		}
	};

	const scheduledRefreshIntervalMinutes = syncStatus.scheduledRefresh?.enabled
		? Math.round(syncStatus.scheduledRefresh.intervalMs / 60000)
		: null;

	const handleAddChannel = async (channel: YouTubeChannel) => {
		try {
			await addSubscriptions([
				{
					id: channel.id,
					title: channel.title,
					description: channel.description,
					thumbnail: channel.thumbnail,
					customUrl: channel.customUrl,
					addedAt: Date.now(),
				},
			]);
			toast.success(`Added ${channel.title}`, {
				description: "Channel added to your subscriptions",
			});
		} catch (error) {
			console.error("Error adding channel:", error);
			toast.error("Failed to add channel", {
				description:
					error instanceof Error ? error.message : "Unknown error occurred",
			});
			throw error;
		}
	};

	return (
		<div className="app-shell min-h-screen">
			<Header
				showMobileSearch={
					activeTab === "subscriptions" ||
					activeTab === TAB_LATEST ||
					activeTab === "queue"
				}
				searchPlaceholder={
					activeTab === TAB_LATEST || activeTab === "queue"
						? "Search videos..."
						: "Search channels..."
				}
				syncStatus={syncStatus}
				cacheStatus={cacheStatus}
				onRetryFailed={() => void refetchVideos()}
				showShorts={showShorts}
				onToggleShorts={() => setShowShorts((prev) => !prev)}
				hideWatched={hideWatched}
				onToggleWatched={() => setHideWatched((prev) => !prev)}
				scrollHidden={!headerVisible}
				compactMobile={isMobileTimeline}
			/>

			{subscriptionsLoading || subscriptionsInitialSyncing ? (
				<div className="min-h-[50vh] flex items-center justify-center">
					<div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
				</div>
			) : hasNoSubscriptions ? (
				<FirstRunOnboarding
					onAddChannel={() => setIsAddChannelModalOpen(true)}
					onImportSuccess={() => {
						// Trigger feed refresh after import
						refetchVideos();
						toast.success("Subscriptions imported! Refreshing your feed...");
					}}
				/>
			) : (
				<div
					data-testid="dashboard-page-chrome"
					className="max-w-7xl mx-auto pt-[var(--app-sticky-gap)] pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-[calc(6rem+env(safe-area-inset-bottom))]"
				>
					{/* Toolbars */}
					<div className="px-4 pt-[var(--app-sticky-gap)] pb-[var(--app-sticky-gap)]">
						{activeTab === "subscriptions" && (
							<div
								data-testid="subscription-groups-toolbar"
								className="flex items-start gap-2 border-b border-gray-200/70 pb-[var(--app-sticky-gap)] dark:border-ios-800/80 sm:items-center"
							>
								<div className="mr-auto flex min-w-0 flex-1 flex-wrap items-center gap-2">
									<label
										htmlFor="subscription-group-filter"
										className="sr-only"
									>
										Filter group
									</label>
									<select
										id="subscription-group-filter"
										aria-label="Filter group"
										value={selectedSubscriptionGroup}
										onChange={(e) =>
											setSelectedSubscriptionGroup(e.target.value)
										}
										className="h-10 max-w-[11rem] rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-red-500 dark:border-ios-800 dark:bg-ios-900 dark:text-ios-200"
									>
										<option value="all">All groups</option>
										{subscriptionGroups.map((group) => (
											<option key={group} value={group}>
												{group}
											</option>
										))}
									</select>

									<button
										type={BTN}
										onClick={() => setIsNewGroupModalOpen(true)}
										className="h-10 rounded-lg bg-gray-800 px-3 text-sm font-medium text-white hover:bg-gray-700 dark:bg-ios-700 dark:hover:bg-ios-600"
									>
										Add group
									</button>
								</div>
								<button
									disabled={isRepairingIcons}
									onClick={handleRepairChannelIcons}
									className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-gray-800 px-0 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-ios-700 dark:hover:bg-ios-600 sm:w-auto sm:px-3"
									title="Repair icons"
								>
									{isRepairingIcons ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<Image className="h-4 w-4" />
									)}
									<span className="hidden sm:inline">
										{isRepairingIcons ? "Repairing..." : "Repair icons"}
									</span>
								</button>
							</div>
						)}

						{activeTab === TAB_LATEST && (
							<div
								data-testid="latest-toolbar"
								className="flex flex-nowrap items-center justify-between gap-1 sm:gap-2"
							>
								<div className="flex min-w-0 flex-nowrap items-center gap-2 sm:gap-3">
									<div className="hidden items-center gap-2 text-xs font-medium text-gray-500 dark:text-ios-400 sm:flex">
										<span>
											Last refreshed {formatRefreshAge(syncStatus.lastUpdated)}
										</span>
										{scheduledRefreshIntervalMinutes && (
											<span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600 dark:bg-ios-800 dark:text-ios-300">
												Auto {scheduledRefreshIntervalMinutes}m
											</span>
										)}
									</div>
								</div>

								<div
									data-testid="latest-toolbar-actions"
									className="ml-auto flex shrink-0 flex-nowrap items-center gap-1 sm:gap-2"
								>
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
											<label htmlFor="bulk-watched-action" className="sr-only">
												Bulk watched action
											</label>
											<select
												id="bulk-watched-action"
												aria-label="Bulk watched action"
												defaultValue=""
												onChange={(event) => {
													handleBulkWatchedAction(event.target.value);
													event.target.value = "";
												}}
												className="hidden h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-red-500 dark:border-ios-800 dark:bg-ios-900 dark:text-ios-200 sm:block"
											>
												<option value="" disabled>
													Mark watched
												</option>
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
					<AnimatePresence mode="wait" initial={false}>
						{activeTab === "subscriptions" ? (
							<motion.div
								key="subscriptions"
								initial={{ opacity: 0, x: -20 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: 20 }}
								transition={{ duration: 0.3 }}
							>
								<DashboardContentBoundary
									onReturnToLatest={() => changeTab(TAB_LATEST)}
								>
									<SubscriptionsList
										selectedGroup={selectedSubscriptionGroup}
										groups={subscriptionGroups}
									/>
								</DashboardContentBoundary>
							</motion.div>
						) : activeTab === TAB_LATEST ? (
							<motion.div
								key={TAB_LATEST}
								initial={{ opacity: 0, x: 20 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -20 }}
								transition={{ duration: 0.3 }}
								className="px-4"
							>
								{videos.length === 0 ? (
									hasTemporaryChannels ? (
										<div className="text-center py-12">
											<p className="text-gray-600 dark:text-ios-400 text-lg mb-2">
												Some channels need channel IDs to fetch videos
											</p>
											<p className="text-sm text-gray-500">
												Channels added with handles or custom names will be
												updated automatically when videos are discovered
											</p>
										</div>
									) : (
										<EmptyState
											icon={TrendingUp}
											iconName={TAB_LATEST}
											title="No videos found"
											detail="New uploads from your subscriptions will appear here."
										/>
									)
								) : (
									<div>
										<p className="hidden sm:block text-sm text-gray-500 dark:text-ios-400 mb-4">
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
													type={BTN}
													onClick={() =>
														setMobileVideoLimit(
															(count) => count + MOBILE_TIMELINE_INCREMENT,
														)
													}
													className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white dark:bg-ios-700"
												>
													Show older videos
												</button>
											</div>
										)}
									</div>
								)}
							</motion.div>
						) : activeTab === "queue" ? (
							<motion.div
								key="queue"
								initial={{ opacity: 0, x: 20 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -20 }}
								transition={{ duration: 0.3 }}
								className="px-4"
							>
								{inProgressVideos.length === 0 &&
								watchLaterVideos.length === 0 ? (
									<EmptyState
										icon={ListVideo}
										iconName="queue"
										title="Your queue is empty"
										detail="Swipe a video right to save it for later. Videos you start watching show up at the top."
									/>
								) : (
									<div className="space-y-6">
										{inProgressVideos.length > 0 && (
											<section data-testid="queue-continue-watching">
												<div className="mb-2 flex items-baseline justify-between">
													<h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-ios-400">
														Continue watching
													</h3>
													<span className="text-[11px] text-gray-500 dark:text-ios-500">
														{inProgressVideos.length} paused
													</span>
												</div>
												<VirtualizedVideoGrid
													videos={inProgressVideos}
													columns={4}
													scrollStorageKey="queue-continue-watching-scroll"
													channelThumbnails={channelThumbnails}
													context="queue"
												/>
											</section>
										)}

										{watchLaterVideos.length > 0 && (
											<section data-testid="queue-watch-later">
												<div className="mb-2 flex items-baseline justify-between">
													<h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-ios-400">
														Watch later
													</h3>
													<span className="text-[11px] text-gray-500 dark:text-ios-500">
														{watchLaterVideos.length} saved
													</span>
												</div>
												<VirtualizedVideoGrid
													videos={watchLaterVideos}
													columns={4}
													scrollStorageKey="queue-watch-later-scroll"
													channelThumbnails={channelThumbnails}
													context="queue"
												/>
											</section>
										)}
									</div>
								)}
							</motion.div>
						) : activeTab === "favorites" ? (
							<motion.div
								key="favorites"
								initial={{ opacity: 0, x: 20 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -20 }}
								transition={{ duration: 0.3 }}
								className="px-4"
							>
								{favoriteChannels.length === 0 &&
								favoriteVideos.length === 0 ? (
									<EmptyState
										icon={Heart}
										iconName="favorites"
										title="No favorites yet"
										detail="Favorite channels or videos to find them here."
									/>
								) : (
									<div className="space-y-8">
										{(favoriteChannels.length > 0 ||
											favoriteVideos.length > 0) && (
											<div
												data-testid="favorite-section-switcher"
												className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-ios-900 sm:hidden"
											>
												<button
													type={BTN}
													aria-pressed={visibleFavoriteSection === "channels"}
													onClick={() => setActiveFavoriteSection("channels")}
													className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
														visibleFavoriteSection === "channels"
															? "bg-white text-gray-950 shadow-sm dark:bg-ios-800 dark:text-ios-50"
															: "text-gray-600 dark:text-ios-300"
													}`}
												>
													Channels ({favoriteChannels.length})
												</button>
												<button
													type={BTN}
													aria-pressed={visibleFavoriteSection === "videos"}
													onClick={() => setActiveFavoriteSection("videos")}
													className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
														visibleFavoriteSection === "videos"
															? "bg-white text-gray-950 shadow-sm dark:bg-ios-800 dark:text-ios-50"
															: "text-gray-600 dark:text-ios-300"
													}`}
												>
													Videos ({favoriteVideos.length})
												</button>
											</div>
										)}

										<section
											data-testid="favorite-channels-section"
											className={`${visibleFavoriteSection === "channels" ? "block" : "hidden sm:block"} ${favoriteChannels.length === 0 ? "sm:hidden" : ""}`}
										>
											<div className="mb-4 flex items-center justify-between gap-3">
												<h2 className="text-lg font-semibold text-gray-900 dark:text-ios-100">
													Channels
												</h2>
												<span className="text-sm text-gray-500 dark:text-ios-400">
													{favoriteChannels.length}
												</span>
											</div>
											{favoriteChannels.length === 0 ? (
												<div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-ios-800 dark:text-ios-400">
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
																const channel = allSubscriptions.find(
																	(s) => s.id === channelId,
																);
																await toggleChannelFavorite(channelId);
																if (channel) {
																	toast.success(
																		`Removed ${channel.title} from favorites`,
																	);
																}
															}}
														/>
													))}
												</div>
											)}
										</section>

										<section
											data-testid="favorite-videos-section"
											className={`${visibleFavoriteSection === "videos" ? "block" : "hidden sm:block"} ${favoriteVideos.length === 0 ? "sm:hidden" : ""}`}
										>
											<div className="mb-4 flex items-center justify-between gap-3">
												<h2 className="text-lg font-semibold text-gray-900 dark:text-ios-100">
													Videos
												</h2>
												<span className="text-sm text-gray-500 dark:text-ios-400">
													{favoriteVideos.length}
												</span>
											</div>
											{favoriteVideos.length === 0 ? (
												<div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-ios-800 dark:text-ios-400">
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
											<h2 className="text-2xl font-bold text-gray-900 dark:text-ios-100 mb-2">
												Most Active Channels
											</h2>
											<p className="text-sm text-gray-500 dark:text-ios-400">
												Top {activeChannels.length} channels by uploads in the
												past 7 days
											</p>
										</div>
										<div className="space-y-3">
											{activeChannels.map((item, index) => (
												<div
													key={item.channel.id}
													onClick={() => openChannel(item.channel.id)}
													className="flex items-center gap-4 p-4 bg-white dark:bg-ios-800 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-gray-200 dark:border-ios-700"
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
														<h3 className="font-semibold text-gray-900 dark:text-ios-100 truncate">
															{item.channel.title}
														</h3>
														<p className="text-sm text-gray-500 dark:text-ios-400">
															{item.count} video{item.count !== 1 ? "s" : ""}{" "}
															this week
														</p>
													</div>
													<div className="text-right">
														<p className="text-xs text-gray-500 dark:text-ios-400">
															Latest upload
														</p>
														<p className="text-sm font-medium text-gray-700 dark:text-ios-300">
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

					<FloatingTabBar
						activeTab={activeTab}
						onTabChange={(tab) => {
							if (tab === TAB_LATEST) {
								handleLatestTabClick();
							} else {
								changeTab(tab);
							}
						}}
						onAddChannel={() => setIsAddChannelModalOpen(true)}
						subscriptionCount={allSubscriptions.length}
						activeChannelCount={activeChannels.length}
						queueCount={inProgressVideos.length}
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
						type={BTN}
						aria-label="Close new group dialog"
						className="absolute inset-0 bg-gray-950/60"
						onClick={() => {
							setIsNewGroupModalOpen(false);
							setNewSubscriptionGroupName("");
						}}
					/>
					<form
						role="dialog"
						aria-modal="true"
						aria-labelledby="new-group-title"
						className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-gray-200 bg-white p-4 shadow-2xl dark:border-ios-800 dark:bg-ios-900 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-28 sm:w-96 sm:-translate-x-1/2 sm:rounded-xl sm:border"
						onSubmit={(event) => {
							event.preventDefault();
							createSubscriptionGroup();
						}}
					>
						<div className="mb-4 flex items-center justify-between gap-3">
							<h2
								id="new-group-title"
								className="text-lg font-semibold text-gray-900 dark:text-ios-100"
							>
								New group
							</h2>
							<button
								type={BTN}
								aria-label="Close new group dialog"
								onClick={() => {
									setIsNewGroupModalOpen(false);
									setNewSubscriptionGroupName("");
								}}
								className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-ios-800 dark:text-ios-200 dark:hover:bg-ios-700"
							>
								<X className="h-5 w-5" />
							</button>
						</div>

						<label
							htmlFor="new-subscription-group"
							className="mb-2 block text-sm font-medium text-gray-700 dark:text-ios-300"
						>
							Group name
						</label>
						<input
							id="new-subscription-group"
							autoFocus
							value={newSubscriptionGroupName}
							onChange={(e) => setNewSubscriptionGroupName(e.target.value)}
							placeholder="Linux, News, Apple..."
							className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-base text-gray-900 outline-none focus:border-red-500 dark:border-ios-800 dark:bg-ios-950 dark:text-ios-100"
						/>

						<div className="mt-5 flex gap-2">
							<button
								type={BTN}
								onClick={() => {
									setIsNewGroupModalOpen(false);
									setNewSubscriptionGroupName("");
								}}
								className="h-10 flex-1 rounded-lg bg-gray-100 px-3 text-sm font-medium text-gray-800 hover:bg-gray-200 dark:bg-ios-800 dark:text-ios-100 dark:hover:bg-ios-700"
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

			{/* Keyboard Shortcuts Help */}
			<KeyboardShortcutsHelp
				isOpen={showShortcutsHelp}
				onClose={() => setShowShortcutsHelp(false)}
			/>
		</div>
	);
};
