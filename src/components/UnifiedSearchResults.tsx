import { useState, type Dispatch, type SetStateAction } from "react";
import { SearchX } from "lucide-react";
import { toast } from "sonner";
import type { YouTubeChannel, YouTubeVideo } from "../types/youtube";
import {
	SEARCH_SCOPE_OPTIONS,
	type SearchScope,
	type UnifiedSearchResults as SearchResults,
} from "../lib/unified-search";
import { useFavoriteVideos } from "../hooks/useFavoriteVideos";
import { useStore } from "../store/useStore";
import { BulkSelectionToolbar } from "./BulkSelectionToolbar";
import { SubscriptionCard } from "./SubscriptionCard";
import { VirtualizedVideoGrid } from "./VirtualizedVideoGrid";

type Props = {
	query: string;
	scope: SearchScope;
	results: SearchResults;
	onScopeChange: (scope: SearchScope) => void;
	onToggleChannelFavorite?: (channelId: string) => Promise<void>;
	channelThumbnails: Map<string, string>;
};

function ResultCount({ count }: { count: number }) {
	return (
		<span className="text-sm font-normal text-gray-500 dark:text-ios-400">
			{count}
		</span>
	);
}

function ChannelResults({
	channels,
	selectedChannelIds,
	onToggleSelect,
}: {
	channels: YouTubeChannel[];
	selectedChannelIds: ReadonlySet<string>;
	onToggleSelect: (channelId: string) => void;
}) {
	if (channels.length === 0) return null;

	return (
		<section aria-labelledby="unified-search-channels-heading">
			<div className="mb-4 flex items-center gap-2">
				<h2
					id="unified-search-channels-heading"
					className="text-lg font-semibold text-gray-900 dark:text-ios-100"
				>
					Channels
				</h2>
				<ResultCount count={channels.length} />
			</div>
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 xl:grid-cols-5">
				{channels.map((channel, index) => (
					<SubscriptionCard
						key={channel.id}
						channel={channel}
						index={index}
						groups={[]}
						selectable
						selected={selectedChannelIds.has(channel.id)}
						onToggleSelect={onToggleSelect}
					/>
				))}
			</div>
		</section>
	);
}

function VideoResults({
	videos,
	channelThumbnails,
	selectedVideoIds,
	onToggleSelect,
}: {
	videos: YouTubeVideo[];
	channelThumbnails: Map<string, string>;
	selectedVideoIds: ReadonlySet<string>;
	onToggleSelect: (videoId: string) => void;
}) {
	if (videos.length === 0) return null;

	return (
		<section aria-labelledby="unified-search-videos-heading">
			<div className="mb-4 flex items-center gap-2">
				<h2
					id="unified-search-videos-heading"
					className="text-lg font-semibold text-gray-900 dark:text-ios-100"
				>
					Videos
				</h2>
				<ResultCount count={videos.length} />
			</div>
			<VirtualizedVideoGrid
				videos={videos}
				columns={4}
				channelThumbnails={channelThumbnails}
				selectable
				selectedVideoIds={selectedVideoIds}
				onToggleSelect={onToggleSelect}
			/>
		</section>
	);
}

export function UnifiedSearchResults({
	query,
	scope,
	results,
	onScopeChange,
	onToggleChannelFavorite,
	channelThumbnails,
}: Props) {
	const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(
		() => new Set(),
	);
	const { favoriteVideoIds, toggleFavoriteVideo } = useFavoriteVideos();
	const { markAsWatched, markAsUnwatched } = useStore();
	const isFavoritesScope = scope === "favorites";
	const channels = isFavoritesScope ? results.favoriteChannels : results.allChannels;
	const videos = isFavoritesScope ? results.favoriteVideos : results.allVideos;
	const showChannels = scope !== "videos";
	const showVideos = scope !== "channels";
	const resultCount =
		(showChannels ? channels.length : 0) + (showVideos ? videos.length : 0);
	const selectedChannels = channels.filter((channel) =>
		selectedChannelIds.has(channel.id),
	);
	const selectedVideos = videos.filter((video) => selectedVideoIds.has(video.id));
	const addToFavoritesCount =
		selectedChannels.filter((channel) => !channel.isFavorite).length +
		selectedVideos.filter((video) => !favoriteVideoIds.has(video.id)).length;
	const removeFromFavoritesCount =
		selectedChannels.filter((channel) => channel.isFavorite).length +
		selectedVideos.filter((video) => favoriteVideoIds.has(video.id)).length;

	const clearSelection = () => {
		setSelectedChannelIds(new Set());
		setSelectedVideoIds(new Set());
	};

	const toggleSelectedId = (
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

	const completeAction = async (message: string, action: () => Promise<void> | void) => {
		try {
			await action();
			clearSelection();
			toast.success(message);
		} catch {
			toast.error("Bulk action failed. Please try again.");
		}
	};

	const handleAddToFavorites = () =>
		completeAction("Added selected items to Favourites", async () => {
			await Promise.all([
				...selectedChannels
					.filter((channel) => !channel.isFavorite)
					.map((channel) => onToggleChannelFavorite?.(channel.id)),
				...selectedVideos
					.filter((video) => !favoriteVideoIds.has(video.id))
					.map((video) => toggleFavoriteVideo(video)),
			]);
		});

	const handleRemoveFromFavorites = () =>
		completeAction("Removed selected items from Favourites", async () => {
			await Promise.all([
				...selectedChannels
					.filter((channel) => channel.isFavorite)
					.map((channel) => onToggleChannelFavorite?.(channel.id)),
				...selectedVideos
					.filter((video) => favoriteVideoIds.has(video.id))
					.map((video) => toggleFavoriteVideo(video)),
			]);
		});

	const handleMarkWatched = () => {
		selectedVideos.forEach((video) => markAsWatched(video.id));
		clearSelection();
		toast.success("Marked selected videos as watched");
	};

	const handleMarkUnwatched = () => {
		selectedVideos.forEach((video) => markAsUnwatched(video.id));
		clearSelection();
		toast.success("Marked selected videos as unwatched");
	};

	const handleScopeChange = (nextScope: SearchScope) => {
		clearSelection();
		onScopeChange(nextScope);
	};

	return (
		<main
			data-testid="unified-search-results"
			className="space-y-8 px-4 pb-8"
		>
			<div className="space-y-3">
				<div>
					<p className="text-sm font-medium text-red-600 dark:text-red-400">
						Search results
					</p>
					<h1 className="mt-1 break-words text-2xl font-bold text-gray-900 dark:text-ios-100">
						{query}
					</h1>
				</div>
				<div
					className="flex flex-wrap gap-2"
					role="tablist"
					aria-label="Search scope"
				>
					{SEARCH_SCOPE_OPTIONS.map((option) => {
						const optionCount =
							option.value === "favorites"
									? results.favoriteChannels.length + results.favoriteVideos.length
									: option.value === "channels"
										? results.allChannels.length
										: option.value === "videos"
											? results.allVideos.length
											: results.allChannels.length + results.allVideos.length;

						return (
							<button
								key={option.value}
								type="button"
								role="tab"
								aria-selected={scope === option.value}
								onClick={() => handleScopeChange(option.value)}
								className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
									scope === option.value
										? "border-red-600 bg-red-600 text-white"
										: "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-ios-800 dark:bg-ios-900 dark:text-ios-200 dark:hover:bg-ios-800"
								}`}
							>
								{option.label} ({optionCount})
							</button>
						);
					})}
				</div>
			</div>

			{resultCount === 0 ? (
				<div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center dark:border-ios-800">
					<SearchX className="mx-auto h-10 w-10 text-gray-400" />
					<h2 className="mt-3 text-lg font-semibold text-gray-900 dark:text-ios-100">
						No matches found
					</h2>
					<p className="mt-1 text-sm text-gray-500 dark:text-ios-400">
						Try another term or choose a different search scope.
					</p>
				</div>
			) : (
			<div className="space-y-10">
				<BulkSelectionToolbar
					selectedVideoCount={selectedVideos.length}
					selectedChannelCount={selectedChannels.length}
					addToFavoritesCount={addToFavoritesCount}
					removeFromFavoritesCount={removeFromFavoritesCount}
					onMarkWatched={handleMarkWatched}
					onMarkUnwatched={handleMarkUnwatched}
					onAddToFavorites={handleAddToFavorites}
					onRemoveFromFavorites={handleRemoveFromFavorites}
					onClear={clearSelection}
				/>
				{showChannels && (
					<ChannelResults
						channels={channels}
						selectedChannelIds={selectedChannelIds}
						onToggleSelect={(channelId) =>
							toggleSelectedId(setSelectedChannelIds, channelId)
						}
					/>
					)}
					{showVideos && (
						<VideoResults
							videos={videos}
							channelThumbnails={channelThumbnails}
							selectedVideoIds={selectedVideoIds}
							onToggleSelect={(videoId) =>
								toggleSelectedId(setSelectedVideoIds, videoId)
							}
						/>
					)}
				</div>
			)}
		</main>
	);
}
