import {
	Component,
	useState,
	useEffect,
	useMemo,
	useRef,
	type ErrorInfo,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
} from "react";
import {
	TrendingUp,
	Loader2,
	Activity,
	Heart,
	Image,
	Filter,
	X,
} from "lucide-react";
import { toast } from "sonner";
import { FirstRunOnboarding } from "./FirstRunOnboarding";
import { Header } from "./Header";
import { AddChannelModal } from "./AddChannelModal";
import { SettingsModal } from "./SettingsModal";
import { FloatingTabBar } from "./FloatingTabBar";
import { SubscriptionsList } from "./SubscriptionsList";
import { SubscriptionCard } from "./SubscriptionCard";
import { VirtualizedVideoGrid } from "./VirtualizedVideoGrid";
import { EmptyState, EmptyStateAction } from "./EmptyState";
import {
	FirstRefreshGuide,
	type FirstRefreshState,
} from "./FirstRefreshGuide";
import { ServerAuthSetup } from "./ServerAuthSetup";
import { SavedFeedViews } from "./SavedFeedViews";
import { FeedFiltersPanel } from "./FeedFiltersPanel";
import { UnifiedSearchResults } from "./UnifiedSearchResults";
import { BulkSelectionToolbar } from "./BulkSelectionToolbar";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useModalFocus } from "../hooks/useModalFocus";
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";
import { PullToRefreshIndicator } from "./PullToRefreshIndicator";
import { useRSSVideos } from "../hooks/useRSSVideos";
import { useSubscriptionStorage } from "../hooks/useSubscriptionStorage";
import { useFavoriteVideos } from "../hooks/useFavoriteVideos";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
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
	readSubscriptionGroups,
	writeSubscriptionGroups,
	SUBSCRIPTION_GROUPS_CHANGED_EVENT,
} from "../lib/subscription-groups";
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
import { getServerApiToken } from "../lib/api-auth";
import { getRecentChannelActivity } from "../lib/channel-activity";
import {
	buildUnifiedSearchResults,
	type SearchScope,
} from "../lib/unified-search";
import type { YouTubeChannel } from "../types/youtube";

type Tab = "subscriptions" | "latest" | "activity" | "favorites";
type FavoriteSection = "channels" | "videos";
type SubscriptionGroupManagerMode = "list" | "rename" | "delete";
const TAB_LATEST: Tab = "latest";
const BTN = "button" as const;
const DASHBOARD_TABS: Tab[] = [
	"subscriptions",
	TAB_LATEST,
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
	const [firstRefreshState, setFirstRefreshState] =
		useState<FirstRefreshState | null>(null);
	const firstRefreshGuideRef = useRef<HTMLElement | null>(null);
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
	const [selectedFavoriteVideoIds, setSelectedFavoriteVideoIds] = useState<
		Set<string>
	>(() => new Set());
	const [selectedFavoriteChannelIds, setSelectedFavoriteChannelIds] = useState<
		Set<string>
	>(() => new Set());
	const [selectedLatestVideoIds, setSelectedLatestVideoIds] = useState<
		Set<string>
	>(() => new Set());
	const [selectedSubscriptionChannelIds, setSelectedSubscriptionChannelIds] =
		useState<Set<string>>(() => new Set());
	const [searchScope, setSearchScope] = useState<SearchScope>("all");
	const [isMobileTimeline, setIsMobileTimeline] = useState(false);
	const [mobileVideoLimit, setMobileVideoLimit] = useState(
		MOBILE_TIMELINE_INITIAL_LIMIT,
	);
	const [selectedSubscriptionGroup, setSelectedSubscriptionGroup] =
		useState("all");
	const [newSubscriptionGroupName, setNewSubscriptionGroupName] = useState("");
	const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);
	const [customSubscriptionGroups, setCustomSubscriptionGroups] = useState<string[]>(
		() => readSubscriptionGroups(),
	);
	const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
	const [groupManagerMode, setGroupManagerMode] =
		useState<SubscriptionGroupManagerMode>("list");
	const [groupManagerTarget, setGroupManagerTarget] = useState<string | null>(
		null,
	);
	const [renamedGroupName, setRenamedGroupName] = useState("");
	const [isManagingGroup, setIsManagingGroup] = useState(false);
	const [isBulkUnsubscribeConfirmOpen, setIsBulkUnsubscribeConfirmOpen] =
		useState(false);
	const [isBulkUnsubscribing, setIsBulkUnsubscribing] = useState(false);
	const [isRepairingIcons, setIsRepairingIcons] = useState(false);
	const [isFeedFiltersOpen, setIsFeedFiltersOpen] = useState(false);
	const [isAuthSettingsOpen, setIsAuthSettingsOpen] = useState(false);
	const newSubscriptionGroupInputRef = useRef<HTMLInputElement>(null);
	const groupManagerInputRef = useRef<HTMLInputElement>(null);
	const closeNewGroupModal = () => {
		setIsNewGroupModalOpen(false);
		setNewSubscriptionGroupName("");
	};
	const newGroupModalFocus = useModalFocus<HTMLFormElement>({
		isOpen: isNewGroupModalOpen,
		onClose: closeNewGroupModal,
		initialFocusRef: newSubscriptionGroupInputRef,
	});
	const closeGroupManager = () => {
		if (isManagingGroup) return;
		setIsGroupManagerOpen(false);
		setGroupManagerMode("list");
		setGroupManagerTarget(null);
		setRenamedGroupName("");
	};
	const returnToGroupList = () => {
		if (isManagingGroup) return;
		setGroupManagerMode("list");
		setGroupManagerTarget(null);
		setRenamedGroupName("");
	};
	const groupManagerFocus = useModalFocus<HTMLDivElement>({
		isOpen: isGroupManagerOpen,
		onClose: closeGroupManager,
		initialFocusRef: groupManagerInputRef,
	});
	const closeBulkUnsubscribeConfirm = () => {
		if (isBulkUnsubscribing) return;
		setIsBulkUnsubscribeConfirmOpen(false);
	};
	const bulkUnsubscribeConfirmFocus = useModalFocus<HTMLDivElement>({
		isOpen: isBulkUnsubscribeConfirmOpen,
		onClose: closeBulkUnsubscribeConfirm,
	});
	const lastActiveLatestTapAtRef = useRef<number | null>(null);
	const {
		allSubscriptions,
		addSubscriptions,
		restoreSubscriptions,
		removeSubscription,
		rawSubscriptions,
		repairChannelIcons,
		toggleFavorite: toggleChannelFavorite,
		toggleMute: toggleChannelMute,
		isLoading: subscriptionsLoading,
		isInitialSyncing: subscriptionsInitialSyncing,
		needsServerAuth,
		clearServerAuth,
		setSubscriptionGroup,
	} = useSubscriptionStorage();
	const {
		favoriteVideoIds,
		favoriteVideos: savedFavoriteVideos,
		toggleFavoriteVideo,
	} =
		useFavoriteVideos();
	const {
		searchQuery,
		watchedVideos,
		markAsWatched,
		markAsUnwatched,
		setSearchQuery,
	} = useStore();

	// Check if any channels have temporary IDs (can't fetch videos)
	const hasTemporaryChannels = rawSubscriptions.some(
		(sub) => sub.id.startsWith("handle_") || sub.id.startsWith("custom_"),
	);

	const {
		videos,
		refresh: refetchVideos,
		isRefreshing,
		refreshPhase,
		refreshProgress,
		syncStatus,
		cacheStatus,
		retryChannel,
		retryingChannelId,
	} = useRSSVideos({ enabled: !needsServerAuth });
	const hasNoSubscriptions = allSubscriptions.length === 0;
	const { pullDistance, isPullRefreshing } = usePullToRefresh({
		isRefreshActive: isRefreshing,
		onRefresh: refetchVideos,
	});
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
	const visibleSubscriptionChannels = useMemo(
		() =>
			selectedSubscriptionGroup === "all"
				? allSubscriptions
				: allSubscriptions.filter(
						(channel) => (channel.group || "") === selectedSubscriptionGroup,
					),
		[selectedSubscriptionGroup, allSubscriptions],
	);
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
	const activeAdvancedFilterCount =
		(durationFilter !== "any" ? 1 : 0) +
		(hideLiveReplays ? 1 : 0) +
		(hidePremieres ? 1 : 0) +
		(hideDuplicateTitles ? 1 : 0) +
		(mutedKeywordText.trim() ? 1 : 0) +
		(boostedKeywordText.trim() ? 1 : 0);

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

	const activeChannels = useMemo(
		() => getRecentChannelActivity(videos, allSubscriptions),
		[videos, allSubscriptions],
	);

	useEffect(() => {
		if (!firstRefreshState) return;
		if (videos.length > 0) {
			setFirstRefreshState(null);
			return;
		}
		const refreshHasCompleted =
			syncStatus.total > 0 &&
			syncStatus.current >= syncStatus.total &&
			!syncStatus.isSyncing;
		if (refreshPhase === "queuing" || refreshPhase === "refreshing") {
			setFirstRefreshState("refreshing");
		} else if (
			syncStatus.isSyncing ||
			syncStatus.state === "running"
		) {
			setFirstRefreshState("refreshing");
		} else if (refreshHasCompleted && syncStatus.errors > 0) {
			setFirstRefreshState("error");
		} else if (refreshHasCompleted || refreshPhase === "done") {
			setFirstRefreshState("empty");
		}
	}, [firstRefreshState, refreshPhase, syncStatus, videos.length]);

	useEffect(() => {
		if (firstRefreshState) {
			firstRefreshGuideRef.current?.focus();
		}
	}, [firstRefreshState]);

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
	const unifiedSearchResults = useMemo(
		() =>
			buildUnifiedSearchResults(searchQuery, {
				videos,
				channels: allSubscriptions,
				favoriteVideos,
				favoriteChannels,
			}),
		[searchQuery, videos, allSubscriptions, favoriteVideos, favoriteChannels],
	);
	const selectedFavoriteVideos = favoriteVideos.filter((video) =>
		selectedFavoriteVideoIds.has(video.id),
	);
	const selectedFavoriteChannels = favoriteChannels.filter((channel) =>
		selectedFavoriteChannelIds.has(channel.id),
	);
	const selectedLatestVideos = visibleLatestVideos.filter((video) =>
		selectedLatestVideoIds.has(video.id),
	);
	const selectedSubscriptionChannels = allSubscriptions.filter((channel) =>
		selectedSubscriptionChannelIds.has(channel.id),
	);

	useEffect(() => {
		const favoriteVideoIdSet = new Set(favoriteVideos.map((video) => video.id));
		const favoriteChannelIdSet = new Set(
			favoriteChannels.map((channel) => channel.id),
		);
		setSelectedFavoriteVideoIds((current) => {
			const next = new Set(
				Array.from(current).filter((id) => favoriteVideoIdSet.has(id)),
			);
			return next.size === current.size ? current : next;
		});
		setSelectedFavoriteChannelIds((current) => {
			const next = new Set(
				Array.from(current).filter((id) => favoriteChannelIdSet.has(id)),
			);
			return next.size === current.size ? current : next;
		});
	}, [favoriteChannels, favoriteVideos]);

	useEffect(() => {
		const latestVideoIdSet = new Set(visibleLatestVideos.map((video) => video.id));
		setSelectedLatestVideoIds((current) => {
			const next = new Set(
				Array.from(current).filter((id) => latestVideoIdSet.has(id)),
			);
			return next.size === current.size ? current : next;
		});
	}, [visibleLatestVideos]);

	useEffect(() => {
		const subscriptionIdSet = new Set(allSubscriptions.map((channel) => channel.id));
		setSelectedSubscriptionChannelIds((current) => {
			const next = new Set(
				Array.from(current).filter((id) => subscriptionIdSet.has(id)),
			);
			return next.size === current.size ? current : next;
		});
	}, [allSubscriptions]);

	const clearFavoriteSelection = () => {
		setSelectedFavoriteVideoIds(new Set());
		setSelectedFavoriteChannelIds(new Set());
	};

	const clearLatestSelection = () => {
		setSelectedLatestVideoIds(new Set());
	};

	const clearSubscriptionSelection = () => {
		setSelectedSubscriptionChannelIds(new Set());
	};

	const toggleSelectionId = (
		setter: Dispatch<SetStateAction<Set<string>>>,
		id: string,
	) => {
		setter((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const toggleAllSelectionIds = (
		setter: Dispatch<SetStateAction<Set<string>>>,
		ids: string[],
	) => {
		setter((current) => {
			const allSelected = ids.length > 0 && ids.every((id) => current.has(id));
			const next = new Set(current);
			ids.forEach((id) => {
				if (allSelected) next.delete(id);
				else next.add(id);
			});
			return next;
		});
	};

	const allVisibleSubscriptionChannelsSelected =
		visibleSubscriptionChannels.length > 0 &&
		visibleSubscriptionChannels.every((channel) =>
			selectedSubscriptionChannelIds.has(channel.id),
		);
	const allFavoriteChannelsSelected =
		favoriteChannels.length > 0 &&
		favoriteChannels.every((channel) => selectedFavoriteChannelIds.has(channel.id));
	const allFavoriteVideosSelected =
		favoriteVideos.length > 0 &&
		favoriteVideos.every((video) => selectedFavoriteVideoIds.has(video.id));
	const allVisibleLatestVideosSelected =
		visibleLatestVideos.length > 0 &&
		visibleLatestVideos.every((video) => selectedLatestVideoIds.has(video.id));

	const markSelectedFavoritesWatched = () => {
		selectedFavoriteVideos.forEach((video) => markAsWatched(video.id));
		clearFavoriteSelection();
		toast.success("Marked selected videos as watched");
	};

	const markSelectedFavoritesUnwatched = () => {
		selectedFavoriteVideos.forEach((video) => markAsUnwatched(video.id));
		clearFavoriteSelection();
		toast.success("Marked selected videos as unwatched");
	};

	const updateSelectedLatestWatchedState = (isWatched: boolean) => {
		const videosToUpdate = selectedLatestVideos.filter(
			(video) => watchedVideos.has(video.id) !== isWatched,
		);
		if (videosToUpdate.length === 0) return;

		videosToUpdate.forEach((video) =>
			(isWatched ? markAsWatched : markAsUnwatched)(video.id),
		);
		clearLatestSelection();
		toast.success(
			`Marked ${videosToUpdate.length} video${videosToUpdate.length === 1 ? "" : "s"} as ${isWatched ? "watched" : "unwatched"}`,
		);
	};

	const markSelectedLatestWatched = () =>
		updateSelectedLatestWatchedState(true);

	const markSelectedLatestUnwatched = () =>
		updateSelectedLatestWatchedState(false);

	const removeSelectedFavorites = async () => {
		try {
			await Promise.all([
				...selectedFavoriteChannels.map((channel) =>
					toggleChannelFavorite(channel.id),
				),
				...selectedFavoriteVideos.map((video) => toggleFavoriteVideo(video)),
			]);
			clearFavoriteSelection();
			toast.success("Removed selected items from Favourites");
		} catch {
			toast.error("Could not remove the selected items from Favourites");
		}
	};

	const updateSelectedSubscriptionFavoriteState = async (isFavorite: boolean) => {
		const channelsToUpdate = selectedSubscriptionChannels.filter(
			(channel) => Boolean(channel.isFavorite) !== isFavorite,
		);
		if (channelsToUpdate.length === 0) return;

		try {
			await Promise.all(
				channelsToUpdate.map((channel) => toggleChannelFavorite(channel.id)),
			);
			clearSubscriptionSelection();
			toast.success(
				isFavorite
					? `Added ${channelsToUpdate.length} channel${channelsToUpdate.length === 1 ? "" : "s"} to Favourites`
					: `Removed ${channelsToUpdate.length} channel${channelsToUpdate.length === 1 ? "" : "s"} from Favourites`,
			);
		} catch {
			toast.error("Could not update selected channels in Favourites");
		}
	};

	const addSelectedSubscriptionsToFavorites = () =>
		updateSelectedSubscriptionFavoriteState(true);

	const removeSelectedSubscriptionsFromFavorites = () =>
		updateSelectedSubscriptionFavoriteState(false);

	const updateSelectedSubscriptionMuteState = async (isMuted: boolean) => {
		const channelsToUpdate = selectedSubscriptionChannels.filter(
			(channel) => Boolean(channel.isMuted) !== isMuted,
		);
		if (channelsToUpdate.length === 0) return;

		try {
			await Promise.all(
				channelsToUpdate.map((channel) => toggleChannelMute(channel.id)),
			);
			clearSubscriptionSelection();
			toast.success(
				isMuted
					? `Muted ${channelsToUpdate.length} channel${channelsToUpdate.length === 1 ? "" : "s"}`
					: `Unmuted ${channelsToUpdate.length} channel${channelsToUpdate.length === 1 ? "" : "s"}`,
			);
		} catch {
			toast.error("Could not update selected channel mute state");
		}
	};

	const muteSelectedSubscriptions = () =>
		updateSelectedSubscriptionMuteState(true);

	const unmuteSelectedSubscriptions = () =>
		updateSelectedSubscriptionMuteState(false);

	const requestBulkUnsubscribe = () => {
		if (selectedSubscriptionChannels.length === 0) return;
		setIsBulkUnsubscribeConfirmOpen(true);
	};

	const confirmBulkUnsubscribe = async () => {
		const subscriptionsToRemove = selectedSubscriptionChannels.map((channel) =>
			rawSubscriptions.find((subscription) => subscription.id === channel.id) ?? {
				id: channel.id,
				title: channel.title,
				description: channel.description,
				thumbnail: channel.thumbnail,
				customUrl: channel.customUrl,
				addedAt: channel.addedAt ?? Date.now(),
				isFavorite: channel.isFavorite,
				isMuted: channel.isMuted,
				group: channel.group,
			},
		);
		if (subscriptionsToRemove.length === 0) return;

		const removedSubscriptions: typeof subscriptionsToRemove = [];
		setIsBulkUnsubscribing(true);
		setIsBulkUnsubscribeConfirmOpen(false);

		try {
			for (const subscription of subscriptionsToRemove) {
				await removeSubscription(subscription.id);
				removedSubscriptions.push(subscription);
			}
			clearSubscriptionSelection();
			toast.success(
				`Unsubscribed ${removedSubscriptions.length} channel${removedSubscriptions.length === 1 ? "" : "s"}`,
				{
					description: "Channels removed from subscriptions",
					action: {
						label: "Undo",
						onClick: async () => {
							try {
								await restoreSubscriptions(removedSubscriptions);
								toast.success(
									`Restored ${removedSubscriptions.length} channel${removedSubscriptions.length === 1 ? "" : "s"}`,
								);
							} catch (error) {
								toast.error("Could not restore removed channels", {
									description: getErrorDescription(error),
								});
							}
						},
					},
				},
			);
		} catch (error) {
			let rollbackFailed = false;
			if (removedSubscriptions.length > 0) {
				try {
					await restoreSubscriptions(removedSubscriptions);
				} catch {
					rollbackFailed = true;
				}
			}
			toast.error("Could not unsubscribe selected channels", {
				description: rollbackFailed
					? "Some channels may need review."
					: getErrorDescription(error),
			});
		} finally {
			setIsBulkUnsubscribing(false);
		}
	};

	const assignChannelsToGroup = async (
		selectedChannels: YouTubeChannel[],
		group: string,
		clearSelection: () => void,
	) => {
		const previousGroups = new Map(
			selectedChannels.map((channel) => [channel.id, channel.group?.trim() || ""]),
		);
		const updatedChannelIds: string[] = [];

		try {
			for (const channel of selectedChannels) {
				await setSubscriptionGroup(channel.id, group);
				updatedChannelIds.push(channel.id);
			}
			clearSelection();
			toast.success(
				group
					? `Assigned ${selectedChannels.length} channel${selectedChannels.length === 1 ? "" : "s"} to ${group}`
					: `Removed group from ${selectedChannels.length} channel${selectedChannels.length === 1 ? "" : "s"}`,
			);
		} catch (error) {
			let rollbackFailed = false;
			for (const channelId of updatedChannelIds) {
				try {
					await setSubscriptionGroup(
						channelId,
						previousGroups.get(channelId) || "",
					);
				} catch {
					rollbackFailed = true;
				}
			}
			toast.error("Could not update selected channels", {
				description: rollbackFailed
					? "Some channel assignments may need review."
					: getErrorDescription(error),
			});
		}
	};

	const assignSelectedFavoriteChannelsToGroup = (group: string) =>
		assignChannelsToGroup(
			[...selectedFavoriteChannels],
			group,
			clearFavoriteSelection,
		);

	const assignSelectedSubscriptionChannelsToGroup = (group: string) =>
		assignChannelsToGroup(
			[...selectedSubscriptionChannels],
			group,
			clearSubscriptionSelection,
		);

	const changeTab = (tab: Tab) => {
		const isTabChange = tab !== activeTab;
		const currentScrollTop = Math.round(window.scrollY);

		// Move the document to the new tab's top before React swaps its content.
		// Otherwise the old tab's scroll offset is applied to the new tab for one
		// paint, which produces a visible jump—especially when opening Subs.
		if (isTabChange) {
			if (activeTab === TAB_LATEST && currentScrollTop > 0) {
				sessionStorage.setItem(
					LATEST_TIMELINE_SCROLL_STORAGE_KEY,
					String(currentScrollTop),
				);
			}
			window.scrollTo({ top: 0, behavior: "auto" });
		}

		setActiveTab(tab);
		if (isTabChange && searchQuery.trim()) {
			setSearchQuery("");
		}
		if (isTabChange) {
			clearFavoriteSelection();
			clearLatestSelection();
			clearSubscriptionSelection();
		}
		writeDashboardTabToUrl(tab);

		if (tab === "favorites") {
			sessionStorage.removeItem("favorite-videos-scroll");
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

		const updatedGroups = Array.from(
			new Set([...customSubscriptionGroups, group]),
		).sort((a, b) => a.localeCompare(b));
		try {
			writeSubscriptionGroups(updatedGroups);
			setCustomSubscriptionGroups(updatedGroups);
		} catch (error) {
			toast.error("Could not save group", {
				description: getErrorDescription(error),
			});
			return;
		}
		setNewSubscriptionGroupName("");
		setIsNewGroupModalOpen(false);
		toast.success(`Created ${group} group`);
	};

	const openGroupManager = () => {
		setGroupManagerMode("list");
		setGroupManagerTarget(null);
		setRenamedGroupName("");
		setIsGroupManagerOpen(true);
	};

	const openRenameGroup = (group: string) => {
		setGroupManagerTarget(group);
		setRenamedGroupName(group);
		setGroupManagerMode("rename");
	};

	const openDeleteGroup = (group: string) => {
		setGroupManagerTarget(group);
		setGroupManagerMode("delete");
	};

	const getAssignedSubscriptions = (group: string) =>
		rawSubscriptions.filter((subscription) => subscription.group?.trim() === group);

	const rollbackGroupAssignments = async (
		channelIds: string[],
		group: string,
	): Promise<boolean> => {
		let rollbackFailed = false;
		for (const channelId of channelIds) {
			try {
				await setSubscriptionGroup(channelId, group);
			} catch {
				rollbackFailed = true;
			}
		}
		return rollbackFailed;
	};

	const renameSubscriptionGroup = async () => {
		const currentGroup = groupManagerTarget;
		const nextGroup = renamedGroupName.trim();
		if (!currentGroup || !nextGroup) {
			toast.error("Enter a group name");
			return;
		}
		if (nextGroup === currentGroup) {
			closeGroupManager();
			return;
		}
		if (subscriptionGroups.includes(nextGroup)) {
			toast.error("That group name is already in use");
			return;
		}

		const assignedSubscriptions = getAssignedSubscriptions(currentGroup);
		const updatedChannelIds: string[] = [];
		setIsManagingGroup(true);
		try {
			for (const subscription of assignedSubscriptions) {
				await setSubscriptionGroup(subscription.id, nextGroup);
				updatedChannelIds.push(subscription.id);
			}
			const updatedGroups = writeSubscriptionGroups(
				customSubscriptionGroups.map((group) =>
					group === currentGroup ? nextGroup : group,
				),
			);
			setCustomSubscriptionGroups(updatedGroups);
			if (selectedSubscriptionGroup === currentGroup) {
				setSelectedSubscriptionGroup(nextGroup);
			}
			closeGroupManager();
			toast.success(`Renamed ${currentGroup} to ${nextGroup}`);
		} catch (error) {
			const rollbackFailed = await rollbackGroupAssignments(
				updatedChannelIds,
				currentGroup,
			);
			toast.error("Could not rename group", {
				description: rollbackFailed
					? "Some channel assignments may need review."
					: getErrorDescription(error),
			});
		} finally {
			setIsManagingGroup(false);
		}
	};

	const deleteSubscriptionGroup = async () => {
		const groupToDelete = groupManagerTarget;
		if (!groupToDelete) return;

		const assignedSubscriptions = getAssignedSubscriptions(groupToDelete);
		const updatedChannelIds: string[] = [];
		setIsManagingGroup(true);
		try {
			for (const subscription of assignedSubscriptions) {
				await setSubscriptionGroup(subscription.id, "");
				updatedChannelIds.push(subscription.id);
			}
			const updatedGroups = writeSubscriptionGroups(
				customSubscriptionGroups.filter((group) => group !== groupToDelete),
			);
			setCustomSubscriptionGroups(updatedGroups);
			if (selectedSubscriptionGroup === groupToDelete) {
				setSelectedSubscriptionGroup("all");
			}
			closeGroupManager();
			toast.success(
				assignedSubscriptions.length > 0
					? `Deleted ${groupToDelete} and ungrouped ${assignedSubscriptions.length} channel${assignedSubscriptions.length === 1 ? "" : "s"}`
					: `Deleted ${groupToDelete} group`,
			);
		} catch (error) {
			const rollbackFailed = await rollbackGroupAssignments(
				updatedChannelIds,
				groupToDelete,
			);
			toast.error("Could not delete group", {
				description: rollbackFailed
					? "Some channel assignments may need review."
					: getErrorDescription(error),
			});
		} finally {
			setIsManagingGroup(false);
		}
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
		if (new URLSearchParams(window.location.search).get("tab") === "queue") {
			writeDashboardTabToUrl(TAB_LATEST);
		}
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
		const syncSubscriptionGroups = () => {
			setCustomSubscriptionGroups(readSubscriptionGroups());
		};

		window.addEventListener(
			SUBSCRIPTION_GROUPS_CHANGED_EVENT,
			syncSubscriptionGroups,
		);
		return () =>
			window.removeEventListener(
				SUBSCRIPTION_GROUPS_CHANGED_EVENT,
				syncSubscriptionGroups,
			);
	}, []);

	useEffect(() => {
		if (isGroupManagerOpen && groupManagerMode === "rename") {
			groupManagerInputRef.current?.focus();
		}
	}, [isGroupManagerOpen, groupManagerMode]);

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

	const clearAdvancedFilters = () => {
		setDurationFilter("any");
		setHideLiveReplays(false);
		setHidePremieres(false);
		setHideDuplicateTitles(false);
		setMutedKeywordText("");
		setBoostedKeywordText("");
	};

	const clearFeedFilters = () => {
		setShowShorts(false);
		setHideWatched(false);
		clearAdvancedFilters();
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
		const isFirstChannel = hasNoSubscriptions;
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
			if (isFirstChannel) {
				setIsAddChannelModalOpen(false);
				setFirstRefreshState("pending");
			}
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
				showMobileSearch={!(needsServerAuth || hasNoSubscriptions)}
				searchPlaceholder="Search videos, channels, and favourites..."
				searchScope={searchScope}
				onSearchScopeChange={setSearchScope}
				syncStatus={syncStatus}
				cacheStatus={cacheStatus}
				onRetryFailed={() => void refetchVideos()}
				onRetryChannel={retryChannel}
				retryingChannelId={retryingChannelId}
				onRefresh={() => refetchVideos()}
				isRefreshing={isRefreshing}
				refreshProgress={refreshProgress}
				showShorts={showShorts}
				onToggleShorts={() => setShowShorts((prev) => !prev)}
				hideWatched={hideWatched}
				onToggleWatched={() => setHideWatched((prev) => !prev)}
				compactMobile={isMobileTimeline}
				minimal={needsServerAuth || hasNoSubscriptions}
			/>

			{refreshPhase !== "idle" && (
				<div
					className="fixed inset-x-0 z-[70] px-4"
					style={{
						bottom: "calc(var(--app-tab-bar-occupied-height) + 1rem)",
					}}
					role="status"
					aria-live="polite"
				>
					<div className="mx-auto w-full max-w-md rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur dark:border-ios-800 dark:bg-ios-900/95">
						<div className="flex items-center justify-between gap-3 text-sm">
							<div className="min-w-0">
								<p className="font-semibold text-gray-900 dark:text-ios-100">
									{refreshPhase === "queuing"
										? "Queueing refresh"
										: refreshPhase === "refreshing"
											? "Refreshing feeds"
											: refreshPhase === "error"
												? "Refresh finished with errors"
												: "Refresh complete"}
								</p>
								<p className="mt-0.5 truncate text-xs text-gray-500 dark:text-ios-400">
									{refreshPhase === "queuing"
										? "Preparing your subscriptions..."
										: `${syncStatus.current} of ${syncStatus.total} channels processed${syncStatus.errors ? ` · ${syncStatus.errors} failed` : ""}`}
								</p>
							</div>
							<span className="shrink-0 text-xs font-semibold text-red-600 dark:text-red-400">
								{refreshProgress}%
							</span>
						</div>
						<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-ios-800">
							<div
								className="h-full rounded-full bg-red-600 transition-[width] duration-500"
								style={{ width: `${refreshProgress}%` }}
							/>
						</div>
					</div>
				</div>
			)}

			{needsServerAuth ? (
				<ServerAuthSetup
					onAuthenticated={clearServerAuth}
					onOpenSettings={() => setIsAuthSettingsOpen(true)}
				/>
			) : subscriptionsLoading ||
				(subscriptionsInitialSyncing && hasNoSubscriptions) ? (
				<div
					data-testid="dashboard-loading"
					className="min-h-[50vh] flex items-center justify-center"
					role="status"
					aria-live="polite"
				>
					<div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
					<span className="sr-only">Loading subscriptions</span>
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
					className="relative max-w-7xl mx-auto pt-[var(--app-sticky-gap)] pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-[calc(6rem+env(safe-area-inset-bottom))]"
					style={{
						transform:
							pullDistance > 0
								? `translateY(${pullDistance}px)`
								: undefined,
						willChange: pullDistance > 0 ? "transform" : undefined,
					}}
				>
					<PullToRefreshIndicator
						pullDistance={pullDistance}
						isRefreshing={isPullRefreshing}
					/>
					{/* Toolbars */}
					<div className="px-4 pt-[var(--app-sticky-gap)] pb-[var(--app-sticky-gap)]">
						{!searchQuery.trim() && activeTab === "subscriptions" && (
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
											onChange={(e) => {
												clearSubscriptionSelection();
												setSelectedSubscriptionGroup(e.target.value);
											}}
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
						aria-pressed={allVisibleSubscriptionChannelsSelected}
						aria-label={
							allVisibleSubscriptionChannelsSelected
								? "Deselect all visible channels"
								: "Select all visible channels"
						}
						onClick={() =>
							toggleAllSelectionIds(
								setSelectedSubscriptionChannelIds,
								visibleSubscriptionChannels.map((channel) => channel.id),
							)
						}
						className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-ios-700 dark:bg-ios-900 dark:text-ios-200 dark:hover:bg-ios-800"
					>
						{allVisibleSubscriptionChannelsSelected
							? "Deselect visible"
							: "Select all visible"}
					</button>

					<button
						type={BTN}
						onClick={() => setIsNewGroupModalOpen(true)}
						className="h-10 rounded-lg bg-gray-800 px-3 text-sm font-medium text-white hover:bg-gray-700 dark:bg-ios-700 dark:hover:bg-ios-600"
					>
						Add group
					</button>
					{customSubscriptionGroups.length > 0 && (
						<button
							type={BTN}
							onClick={openGroupManager}
							className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-ios-700 dark:bg-ios-900 dark:text-ios-200 dark:hover:bg-ios-800"
						>
							Manage groups
						</button>
					)}
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

						{!searchQuery.trim() && activeTab === TAB_LATEST && (
							<>
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
											<button
												type={BTN}
												aria-expanded={isFeedFiltersOpen}
												aria-controls="feed-filters-panel"
												aria-label={
													activeAdvancedFilterCount > 0
														? `Filters, ${activeAdvancedFilterCount} active`
														: "Filters"
												}
												onClick={() => setIsFeedFiltersOpen((open) => !open)}
												className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
													isFeedFiltersOpen || activeAdvancedFilterCount > 0
														? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
														: "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-ios-800 dark:bg-ios-900 dark:text-ios-200 dark:hover:bg-ios-800"
												}`}
											>
												<Filter className="h-4 w-4" aria-hidden="true" />
												<span className="hidden sm:inline">Filters</span>
												{activeAdvancedFilterCount > 0 && (
													<span className="min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] leading-4 text-white dark:bg-red-500">
														{activeAdvancedFilterCount}
													</span>
												)}
																									</button>
																				{visibleLatestVideos.length > 0 && (
																					<button
																						type={BTN}
																						aria-pressed={allVisibleLatestVideosSelected}
																						aria-label={
																								allVisibleLatestVideosSelected
																									? "Deselect all visible videos"
																									: "Select all visible videos"
																							}
																							onClick={() =>
																								toggleAllSelectionIds(
																									setSelectedLatestVideoIds,
																									visibleLatestVideos.map((video) => video.id),
																									)
																								}
																							className="inline-flex h-10 items-center rounded-lg border border-gray-200 bg-white px-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-ios-800 dark:bg-ios-900 dark:text-ios-200 dark:hover:bg-ios-800 sm:px-3"
																					>
																							<span className="sm:hidden">
																								{allVisibleLatestVideosSelected ? "Deselect" : "Select"}
																							</span>
																							<span className="hidden sm:inline">
																								{allVisibleLatestVideosSelected
																									? "Deselect visible"
																									: "Select all visible"}
																							</span>
																							</button>
																					)}
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
								{isFeedFiltersOpen && (
									<FeedFiltersPanel
										durationFilter={durationFilter}
										onDurationFilterChange={setDurationFilter}
										hideLiveReplays={hideLiveReplays}
										onToggleLiveReplays={() =>
										setHideLiveReplays((value) => !value)
										}
										hidePremieres={hidePremieres}
										onTogglePremieres={() =>
										setHidePremieres((value) => !value)
										}
										hideDuplicateTitles={hideDuplicateTitles}
										onToggleDuplicateTitles={() =>
										setHideDuplicateTitles((value) => !value)
										}
										mutedKeywordText={mutedKeywordText}
										onMutedKeywordTextChange={setMutedKeywordText}
										boostedKeywordText={boostedKeywordText}
										onBoostedKeywordTextChange={setBoostedKeywordText}
										activeFilterCount={activeAdvancedFilterCount}
										onClear={clearAdvancedFilters}
										onClose={() => setIsFeedFiltersOpen(false)}
									/>
								)}
							</>
						)}
					</div>

					{/* Content */}
					<>
						{searchQuery.trim() ? (
							<UnifiedSearchResults
								key={searchQuery.trim()}
								query={searchQuery.trim()}
								scope={searchScope}
							results={unifiedSearchResults}
							onScopeChange={setSearchScope}
							onToggleChannelFavorite={toggleChannelFavorite}
							channelThumbnails={channelThumbnails}
							/>
						) : activeTab === "subscriptions" ? (
											<div>
												<div className="mb-4 px-4">
													<BulkSelectionToolbar
														selectedVideoCount={0}
															selectedChannelCount={selectedSubscriptionChannels.length}
															groupOptions={subscriptionGroups}
															showVideoActions={false}
															addToFavoritesCount={selectedSubscriptionChannels.filter((channel) => !channel.isFavorite).length}
															removeFromFavoritesCount={selectedSubscriptionChannels.filter((channel) => channel.isFavorite).length}
															showMuteActions
															showUnsubscribeAction
															muteChannelsCount={selectedSubscriptionChannels.filter((channel) => !channel.isMuted).length}
															unmuteChannelsCount={selectedSubscriptionChannels.filter((channel) => channel.isMuted).length}
															onMarkWatched={() => undefined}
															onMarkUnwatched={() => undefined}
															onAddToFavorites={addSelectedSubscriptionsToFavorites}
															onRemoveFromFavorites={removeSelectedSubscriptionsFromFavorites}
															onMuteChannels={muteSelectedSubscriptions}
															onUnmuteChannels={unmuteSelectedSubscriptions}
															onUnsubscribeChannels={requestBulkUnsubscribe}
															onAssignChannelsToGroup={assignSelectedSubscriptionChannelsToGroup}
															onClear={clearSubscriptionSelection}
													/>
												</div>
												<DashboardContentBoundary
									onReturnToLatest={() => changeTab(TAB_LATEST)}
								>
									<SubscriptionsList
															selectedGroup={selectedSubscriptionGroup}
															groups={subscriptionGroups}
															selectable
															selectedChannelIds={selectedSubscriptionChannelIds}
															onToggleSelect={(channelId) =>
																toggleSelectionId(
																	setSelectedSubscriptionChannelIds,
																	channelId,
																)
															}
															onClearGroup={() => setSelectedSubscriptionGroup("all")}
									/>
								</DashboardContentBoundary>
							</div>
							) : activeTab === TAB_LATEST ? (
								<div className="px-4">
									{firstRefreshState ? (
										<FirstRefreshGuide
											state={firstRefreshState}
											isRefreshing={isRefreshing}
											onRefresh={() => void refetchVideos()}
											guideRef={firstRefreshGuideRef}
										/>
									) : videos.length === 0 ? (
										hasTemporaryChannels ? (
											<div className="text-center py-12">
												<p className="text-gray-600 dark:text-ios-400 text-lg mb-2">
													Some channels need channel IDs to fetch videos
													</p>
													<p className="text-sm text-gray-500">
														Channels added with handles or custom names will be
																updated automatically when videos are discovered
															</p>
														<EmptyStateAction
															onClick={() => void refetchVideos()}
															disabled={isRefreshing}
														>
															{isRefreshing ? "Refreshing feeds..." : "Refresh feeds"}
														</EmptyStateAction>
													</div>
											) : (
												<EmptyState
													icon={TrendingUp}
													iconName={TAB_LATEST}
													title="No videos found"
													detail="New uploads from your subscriptions will appear here."
													action={
														<EmptyStateAction
															onClick={() => void refetchVideos()}
															disabled={isRefreshing}
														>
																	{isRefreshing ? "Refreshing feeds..." : "Refresh feeds"}
																</EmptyStateAction>
																}
															/>
												)
										) : filteredVideos.length === 0 ? (
											<EmptyState
												icon={Filter}
												iconName="filtered-latest"
												title="No videos match your filters"
												detail="Clear the active filters to see more videos in Latest."
												action={
													<EmptyStateAction onClick={clearFeedFilters}>
														Clear filters
													</EmptyStateAction>
												}
											/>
																) : (
																	<div>
																		<div className="mb-4">
																			<BulkSelectionToolbar
																				selectedVideoCount={selectedLatestVideos.length}
																				selectedChannelCount={0}
																				showFavoriteActions={false}
																				addToFavoritesCount={0}
																				removeFromFavoritesCount={0}
																				onMarkWatched={markSelectedLatestWatched}
																				onMarkUnwatched={markSelectedLatestUnwatched}
																				onAddToFavorites={() => undefined}
																				onRemoveFromFavorites={() => undefined}
																				onClear={clearLatestSelection}
																			/>
																		</div>
																		<p className="hidden sm:block text-sm text-gray-500 dark:text-ios-400 mb-4">
											Showing {filteredVideos.length} recent videos
										</p>
										<VirtualizedVideoGrid
											videos={visibleLatestVideos}
																					columns={4}
																				scrollStorageKey="latest-videos-scroll"
																				channelThumbnails={channelThumbnails}
																			selectable
																			selectedVideoIds={selectedLatestVideoIds}
																			onToggleSelect={(videoId) =>
																					toggleSelectionId(
																						setSelectedLatestVideoIds,
																						videoId,
																					)
																				}
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
							</div>
							) : activeTab === "favorites" ? (
							<div className="px-4">
								{favoriteChannels.length === 0 &&
								favoriteVideos.length === 0 ? (
																	<EmptyState
																		icon={Heart}
																		iconName="favorites"
																		title="No favorites yet"
																		detail="Favorite channels or videos to find them here."
																		action={
																			<EmptyStateAction onClick={() => changeTab(TAB_LATEST)}>
																			Browse Latest
																		</EmptyStateAction>
																	}
																	/>
								) : (
									<div className="space-y-8">
						<BulkSelectionToolbar
							selectedVideoCount={selectedFavoriteVideos.length}
							selectedChannelCount={selectedFavoriteChannels.length}
											groupOptions={subscriptionGroups}
							addToFavoritesCount={0}
											removeFromFavoritesCount={
													selectedFavoriteVideos.length +
													selectedFavoriteChannels.length
											}
											onMarkWatched={markSelectedFavoritesWatched}
											onMarkUnwatched={markSelectedFavoritesUnwatched}
							onAddToFavorites={() => undefined}
							onRemoveFromFavorites={removeSelectedFavorites}
											onAssignChannelsToGroup={assignSelectedFavoriteChannelsToGroup}
							onClear={clearFavoriteSelection}
										/>
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
													<div className="flex items-center gap-2">
														<span className="text-sm text-gray-500 dark:text-ios-400">
															{favoriteChannels.length}
														</span>
														<button
															type={BTN}
															aria-pressed={allFavoriteChannelsSelected}
															aria-label={
																allFavoriteChannelsSelected
																	? "Deselect all visible channels"
																	: "Select all visible channels"
															}
															onClick={() =>
																toggleAllSelectionIds(
																	setSelectedFavoriteChannelIds,
																	favoriteChannels.map((channel) => channel.id),
																)
															}
															className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-ios-700 dark:text-ios-300 dark:hover:bg-ios-800"
														>
															{allFavoriteChannelsSelected
																? "Deselect"
																: "Select all"}
														</button>
													</div>
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
																selectable
																selected={selectedFavoriteChannelIds.has(channel.id)}
																onToggleSelect={(channelId) =>
														toggleSelectionId(
																		setSelectedFavoriteChannelIds,
																		channelId,
																	)
																}
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
													<div className="flex items-center gap-2">
														<span className="text-sm text-gray-500 dark:text-ios-400">
															{favoriteVideos.length}
														</span>
														<button
															type={BTN}
															aria-pressed={allFavoriteVideosSelected}
															aria-label={
																allFavoriteVideosSelected
																	? "Deselect all visible videos"
																	: "Select all visible videos"
															}
															onClick={() =>
																toggleAllSelectionIds(
																	setSelectedFavoriteVideoIds,
																	favoriteVideos.map((video) => video.id),
																)
															}
															className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-ios-700 dark:text-ios-300 dark:hover:bg-ios-800"
														>
															{allFavoriteVideosSelected
																? "Deselect"
																: "Select all"}
														</button>
													</div>
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
																	selectable
																	selectedVideoIds={selectedFavoriteVideoIds}
																	onToggleSelect={(videoId) =>
														toggleSelectionId(
																			setSelectedFavoriteVideoIds,
																			videoId,
																	)
																	}
																/>
											)}
										</section>
									</div>
								)}
							</div>
						) : (
							<div className="px-4">
								{activeChannels.length === 0 ? (
																<EmptyState
																	icon={Activity}
																	iconName="activity"
																	title="No activity yet"
																	detail="Recent uploads from your channels will appear here."
																	action={
																		<EmptyStateAction onClick={() => changeTab(TAB_LATEST)}>
																			View Latest
																		</EmptyStateAction>
																	}
																/>
								) : (
									<>
										<div className="mb-4">
											<h2 className="text-2xl font-bold text-gray-900 dark:text-ios-100 mb-2">
												Recent Channel Activity
											</h2>
											<p className="text-sm text-gray-500 dark:text-ios-400">
												{activeChannels.length} channel
												{activeChannels.length === 1 ? "" : "s"} with uploads in the
												past 7 days, ordered by volume and recency
											</p>
										</div>
										<div className="space-y-3">
											{activeChannels.map((item, index) => (
												<div
													key={item.channel.id}
													data-testid="activity-channel-item"
													data-channel-id={item.channel.id}
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
							</div>
						)}
					</>

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
						favoriteCount={favoriteChannels.length + favoriteVideos.length}
					/>
				</div>
			)}

			{/* Add Channel Modal */}
			<AddChannelModal
				isOpen={isAddChannelModalOpen}
				onClose={() => setIsAddChannelModalOpen(false)}
				onAdd={handleAddChannel}
					existingSubscriptions={allSubscriptions}
			/>

			{isBulkUnsubscribeConfirmOpen && (
				<div className="fixed inset-0 z-[120]">
					<button
						type={BTN}
						aria-label="Close unsubscribe confirmation"
						disabled={isBulkUnsubscribing}
						className="absolute inset-0 bg-gray-950/60 disabled:cursor-wait"
						onClick={closeBulkUnsubscribeConfirm}
					/>
					<div
						ref={bulkUnsubscribeConfirmFocus.modalRef}
						role="dialog"
						aria-modal="true"
						aria-labelledby="bulk-unsubscribe-title"
						tabIndex={-1}
						onKeyDown={bulkUnsubscribeConfirmFocus.onKeyDown}
						className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-gray-200 bg-white p-4 shadow-2xl dark:border-ios-800 dark:bg-ios-900 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-28 sm:w-[30rem] sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:rounded-xl sm:border"
					>
						<div className="mb-4 flex items-center justify-between gap-3">
							<h2
								id="bulk-unsubscribe-title"
								className="text-lg font-semibold text-gray-900 dark:text-ios-100"
							>
								Unsubscribe selected channels?
							</h2>
							<button
								type={BTN}
								aria-label="Close unsubscribe confirmation"
								disabled={isBulkUnsubscribing}
								onClick={closeBulkUnsubscribeConfirm}
								className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:cursor-wait disabled:opacity-60 dark:bg-ios-800 dark:text-ios-200 dark:hover:bg-ios-700"
							>
								<X className="h-5 w-5" />
							</button>
						</div>
						<p className="text-sm leading-5 text-gray-700 dark:text-ios-200">
							This will remove {selectedSubscriptionChannels.length} selected channel
							{selectedSubscriptionChannels.length === 1 ? "" : "s"} from your
							subscriptions. You can undo immediately from the confirmation toast.
						</p>
						<div className="mt-5 flex gap-2">
							<button
								type={BTN}
								onClick={closeBulkUnsubscribeConfirm}
								disabled={isBulkUnsubscribing}
								className="h-10 flex-1 rounded-lg bg-gray-100 px-3 text-sm font-medium text-gray-800 hover:bg-gray-200 disabled:cursor-wait disabled:opacity-60 dark:bg-ios-800 dark:text-ios-100 dark:hover:bg-ios-700"
							>
								Cancel
							</button>
							<button
								type={BTN}
								onClick={() => void confirmBulkUnsubscribe()}
								disabled={isBulkUnsubscribing}
								className="h-10 flex-1 rounded-lg bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
							>
								{isBulkUnsubscribing ? "Unsubscribing..." : "Unsubscribe channels"}
							</button>
						</div>
					</div>
				</div>
			)}

			{isGroupManagerOpen && (
				<div className="fixed inset-0 z-[120]">
					<button
						type={BTN}
						aria-label="Close group manager"
						disabled={isManagingGroup}
						className="absolute inset-0 bg-gray-950/60 disabled:cursor-wait"
						onClick={closeGroupManager}
					/>
					<div
						ref={groupManagerFocus.modalRef}
						role="dialog"
						aria-modal="true"
						aria-labelledby="group-manager-title"
						tabIndex={-1}
						onKeyDown={groupManagerFocus.onKeyDown}
						className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-gray-200 bg-white p-4 shadow-2xl dark:border-ios-800 dark:bg-ios-900 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-28 sm:w-[30rem] sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:rounded-xl sm:border"
					>
						<div className="mb-4 flex items-center justify-between gap-3">
							<h2
								id="group-manager-title"
								className="text-lg font-semibold text-gray-900 dark:text-ios-100"
							>
								Manage groups
							</h2>
							<button
								type={BTN}
								aria-label="Close group manager"
								disabled={isManagingGroup}
								onClick={closeGroupManager}
								className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:cursor-wait disabled:opacity-60 dark:bg-ios-800 dark:text-ios-200 dark:hover:bg-ios-700"
							>
								<X className="h-5 w-5" />
							</button>
						</div>

						{groupManagerMode === "list" && (
							<div className="space-y-3">
								<p className="text-sm leading-5 text-gray-600 dark:text-ios-300">
									Renaming keeps channels in the group. Deleting a group only removes its label and un-groups its channels.
								</p>
								<div className="space-y-2">
									{customSubscriptionGroups.map((group) => {
										const assignedCount = getAssignedSubscriptions(group).length;
										return (
											<div
												key={group}
												className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-ios-800"
											>
												<div className="min-w-0 flex-1">
													<p className="truncate text-sm font-medium text-gray-900 dark:text-ios-100">
														{group}
													</p>
													<p className="text-xs text-gray-500 dark:text-ios-400">
														{assignedCount} assigned channel{assignedCount === 1 ? "" : "s"}
													</p>
												</div>
												<div className="flex shrink-0 gap-2">
													<button
														type={BTN}
														aria-label={`Rename ${group}`}
														onClick={() => openRenameGroup(group)}
														className="rounded-lg px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-ios-200 dark:hover:bg-ios-800"
													>
														Rename
													</button>
													<button
														type={BTN}
														aria-label={`Delete ${group}`}
														onClick={() => openDeleteGroup(group)}
														className="rounded-lg px-2.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
													>
														Delete
													</button>
												</div>
											</div>
										);
									})}
								</div>
							</div>
						)}

						{groupManagerMode === "rename" && groupManagerTarget && (
							<form
								className="space-y-4"
								onSubmit={(event) => {
									event.preventDefault();
									void renameSubscriptionGroup();
								}}
							>
								<p className="text-sm leading-5 text-gray-600 dark:text-ios-300">
									Channels assigned to <span className="font-medium">{groupManagerTarget}</span> will stay assigned under the new name.
								</p>
								<label
									htmlFor="rename-subscription-group"
									className="block text-sm font-medium text-gray-700 dark:text-ios-300"
								>
									New group name
								</label>
								<input
									id="rename-subscription-group"
									ref={groupManagerInputRef}
									value={renamedGroupName}
									onChange={(event) => setRenamedGroupName(event.target.value)}
									className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-base text-gray-900 outline-none focus:border-red-500 dark:border-ios-800 dark:bg-ios-950 dark:text-ios-100"
								/>
								<div className="flex gap-2">
									<button
										type={BTN}
										onClick={returnToGroupList}
										disabled={isManagingGroup}
										className="h-10 flex-1 rounded-lg bg-gray-100 px-3 text-sm font-medium text-gray-800 hover:bg-gray-200 disabled:opacity-60 dark:bg-ios-800 dark:text-ios-100 dark:hover:bg-ios-700"
									>
										Back
									</button>
									<button
										type="submit"
										disabled={isManagingGroup}
										className="h-10 flex-1 rounded-lg bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
									>
										{isManagingGroup ? "Renaming..." : "Rename group"}
									</button>
								</div>
							</form>
						)}

						{groupManagerMode === "delete" && groupManagerTarget && (
							<div className="space-y-4">
								{(() => {
									const assignedCount = getAssignedSubscriptions(groupManagerTarget).length;
									return (
										<>
											<p className="text-sm leading-5 text-gray-700 dark:text-ios-200">
												Delete <span className="font-semibold">{groupManagerTarget}</span>? This will remove the group label and un-group {assignedCount} channel{assignedCount === 1 ? "" : "s"}. Your subscriptions will not be deleted.
											</p>
											<div className="flex gap-2">
												<button
													type={BTN}
													onClick={returnToGroupList}
													disabled={isManagingGroup}
													className="h-10 flex-1 rounded-lg bg-gray-100 px-3 text-sm font-medium text-gray-800 hover:bg-gray-200 disabled:opacity-60 dark:bg-ios-800 dark:text-ios-100 dark:hover:bg-ios-700"
												>
													Back
												</button>
												<button
													type={BTN}
													onClick={() => void deleteSubscriptionGroup()}
													disabled={isManagingGroup}
													className="h-10 flex-1 rounded-lg bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
												>
													{isManagingGroup ? "Deleting..." : "Delete group"}
												</button>
											</div>
										</>
									);
								})()}
							</div>
						)}
					</div>
				</div>
			)}

			{isNewGroupModalOpen && (
				<div className="fixed inset-0 z-[120]">
					<button
						type={BTN}
						aria-label="Close new group dialog"
						className="absolute inset-0 bg-gray-950/60"
						onClick={closeNewGroupModal}
					/>
					<form
						ref={newGroupModalFocus.modalRef}
						role="dialog"
						aria-modal="true"
						aria-labelledby="new-group-title"
						tabIndex={-1}
						onKeyDown={newGroupModalFocus.onKeyDown}
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
								onClick={closeNewGroupModal}
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
							ref={newSubscriptionGroupInputRef}
							value={newSubscriptionGroupName}
							onChange={(e) => setNewSubscriptionGroupName(e.target.value)}
							placeholder="Linux, News, Apple..."
							className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-base text-gray-900 outline-none focus:border-red-500 dark:border-ios-800 dark:bg-ios-950 dark:text-ios-100"
						/>

						<div className="mt-5 flex gap-2">
							<button
								type={BTN}
								onClick={closeNewGroupModal}
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

			{/* Settings modal for the auth-required flow */}
			{needsServerAuth && (
				<SettingsModal
					isOpen={isAuthSettingsOpen}
					onClose={() => {
						setIsAuthSettingsOpen(false);
						if (getServerApiToken()) void clearServerAuth();
					}}
				/>
			)}
		</div>
	);
};
