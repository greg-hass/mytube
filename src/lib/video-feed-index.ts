import type { YouTubeChannel, YouTubeVideo } from '../types/youtube';

const SHORTS_TEXT_PATTERN = /#shorts?\b|\bshorts\b|youtube\.com\/shorts\//i;

type VideoWithNullableDuration = YouTubeVideo & { duration?: number | null };

export interface IndexedVideo {
  video: YouTubeVideo;
  searchText: string;
  isShort: boolean;
}

export interface VideoFeedIndex {
  items: IndexedVideo[];
  videosById: Map<string, IndexedVideo>;
  mutedChannelIds: Set<string>;
}

export interface VideoFilterOptions {
  searchQuery: string;
  showShorts: boolean;
}

export function isShortVideo(video: Pick<VideoWithNullableDuration, 'title' | 'description' | 'duration'>) {
  if (video.duration !== undefined && video.duration !== null && video.duration > 0 && video.duration <= 60) {
    return true;
  }

  return SHORTS_TEXT_PATTERN.test(`${video.title || ''} ${video.description || ''}`);
}

function buildSearchText(video: YouTubeVideo) {
  return `${video.title} ${video.channelTitle}`.toLowerCase();
}

export function buildVideoFeedIndex(videos: YouTubeVideo[], channels: YouTubeChannel[]): VideoFeedIndex {
  const mutedChannelIds = new Set(
    channels
      .filter((channel) => channel.isMuted)
      .map((channel) => channel.id)
  );
  const items = videos.map((video) => ({
    video,
    searchText: buildSearchText(video),
    isShort: isShortVideo(video),
  }));

  return {
    items,
    videosById: new Map(items.map((item) => [item.video.id, item])),
    mutedChannelIds,
  };
}

export function filterIndexedVideos(index: VideoFeedIndex, options: VideoFilterOptions) {
  const normalizedSearch = options.searchQuery.trim().toLowerCase();

  return index.items.filter((item) => {
    if (index.mutedChannelIds.has(item.video.channelId)) return false;
    if (!options.showShorts && item.isShort) return false;
    if (normalizedSearch && !item.searchText.includes(normalizedSearch)) return false;

    return true;
  });
}
