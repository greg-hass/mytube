import type { YouTubeChannel, YouTubeVideo } from "../types/youtube";

export type SearchScope = "all" | "videos" | "channels" | "favorites";

export const SEARCH_SCOPE_OPTIONS: ReadonlyArray<{
	value: SearchScope;
	label: string;
}> = [
	{ value: "all", label: "All" },
	{ value: "videos", label: "Videos" },
	{ value: "channels", label: "Channels" },
	{ value: "favorites", label: "Favourites" },
];

export type UnifiedSearchSources = {
	videos: YouTubeVideo[];
	channels: YouTubeChannel[];
	favoriteVideos: YouTubeVideo[];
	favoriteChannels: YouTubeChannel[];
};

export type UnifiedSearchResults = {
	allVideos: YouTubeVideo[];
	allChannels: YouTubeChannel[];
	favoriteVideos: YouTubeVideo[];
	favoriteChannels: YouTubeChannel[];
};

function normalize(value: string | undefined | null) {
	return value?.trim().toLocaleLowerCase() || "";
}

function matchesQuery(query: string, values: Array<string | undefined | null>) {
	const normalizedQuery = normalize(query);
	if (!normalizedQuery) return false;
	return values.some((value) => normalize(value).includes(normalizedQuery));
}

function sortChannels(channels: YouTubeChannel[]) {
	return [...channels].sort(
		(a, b) =>
			a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
	);
}

function sortVideos(videos: YouTubeVideo[]) {
	return [...videos].sort((a, b) => {
		const publishedDifference =
			new Date(b.publishedAt || 0).getTime() -
			new Date(a.publishedAt || 0).getTime();
		return publishedDifference || a.id.localeCompare(b.id);
	});
}

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]) {
	const byId = new Map(primary.map((item) => [item.id, item]));
	for (const item of secondary) {
		if (!byId.has(item.id)) byId.set(item.id, item);
	}
	return Array.from(byId.values());
}

function filterVideos(videos: YouTubeVideo[], query: string) {
	return sortVideos(
		videos.filter((video) =>
			matchesQuery(query, [
				video.title,
				video.channelTitle,
				video.description,
				video.id,
			]),
		),
	);
}

function filterChannels(channels: YouTubeChannel[], query: string) {
	return sortChannels(
		channels.filter((channel) =>
			matchesQuery(query, [
				channel.title,
				channel.customUrl,
				channel.id,
				channel.description,
			]),
		),
	);
}

export function buildUnifiedSearchResults(
	query: string,
	sources: UnifiedSearchSources,
): UnifiedSearchResults {
	const allVideos = mergeById(sources.videos, sources.favoriteVideos);
	const allChannels = mergeById(sources.channels, sources.favoriteChannels);

	return {
		allVideos: filterVideos(allVideos, query),
		allChannels: filterChannels(allChannels, query),
		favoriteVideos: filterVideos(sources.favoriteVideos, query),
		favoriteChannels: filterChannels(sources.favoriteChannels, query),
	};
}
