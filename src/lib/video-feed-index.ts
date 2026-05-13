import type { YouTubeChannel, YouTubeVideo } from '../types/youtube';

const SHORTS_TEXT_PATTERN = /#shorts?\b|\bshorts\b|youtube\.com\/shorts\//i;
const LIVE_REPLAY_TEXT_PATTERN = /\b(live\s*stream|livestream|watchalong|replay|full\s+stream)\b/i;
const PREMIERE_TEXT_PATTERN = /\bpremieres?\b|\bpremiering\b/i;
const LEGACY_SHORTS_MAX_SECONDS = 60;
const DIMENSION_BASED_SHORTS_MAX_SECONDS = 3 * 60;
const TEN_MINUTES_SECONDS = 10 * 60;
const THIRTY_MINUTES_SECONDS = 30 * 60;

type VideoWithNullableDuration = YouTubeVideo & { duration?: number | null };
export type DurationFilter = 'any' | 'under-10' | '10-30' | '30-plus';

export interface IndexedVideo {
  video: YouTubeVideo;
  searchText: string;
  keywordText: string;
  normalizedTitle: string;
  isShort: boolean;
  isLiveReplay: boolean;
  isPremiere: boolean;
}

export interface VideoFeedIndex {
  items: IndexedVideo[];
  videosById: Map<string, IndexedVideo>;
  mutedChannelIds: Set<string>;
}

export interface VideoFilterOptions {
  searchQuery: string;
  showShorts: boolean;
  durationFilter?: DurationFilter;
  hideLiveReplays?: boolean;
  hidePremieres?: boolean;
  hideDuplicateTitles?: boolean;
  mutedKeywords?: string[];
  boostedKeywords?: string[];
}

function isSquareOrVerticalVideo(video: Pick<YouTubeVideo, 'videoWidth' | 'videoHeight'>) {
  const width = video.videoWidth;
  const height = video.videoHeight;

  return Boolean(width && height && width > 0 && height > 0 && height >= width);
}

export function isShortVideo(video: Pick<VideoWithNullableDuration, 'title' | 'description' | 'duration' | 'videoWidth' | 'videoHeight'>) {
  const duration = video.duration;

  if (!duration || duration <= 0) {
    return SHORTS_TEXT_PATTERN.test(`${video.title || ''} ${video.description || ''}`);
  }

  if (duration <= LEGACY_SHORTS_MAX_SECONDS) {
    return true;
  }

  if (duration <= DIMENSION_BASED_SHORTS_MAX_SECONDS && isSquareOrVerticalVideo(video)) {
    return true;
  }

  return SHORTS_TEXT_PATTERN.test(`${video.title || ''} ${video.description || ''}`);
}

function buildSearchText(video: YouTubeVideo) {
  return `${video.title} ${video.channelTitle}`.toLowerCase();
}

function buildKeywordText(video: YouTubeVideo) {
  return `${video.title} ${video.channelTitle} ${video.description || ''}`.toLowerCase();
}

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeKeywords(keywords: string[] = []) {
  return keywords
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
}

function matchesAnyKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function isLiveReplayVideo(video: Pick<YouTubeVideo, 'title' | 'description'>) {
  return LIVE_REPLAY_TEXT_PATTERN.test(`${video.title || ''} ${video.description || ''}`);
}

export function isPremiereVideo(video: Pick<YouTubeVideo, 'title' | 'description'>) {
  return PREMIERE_TEXT_PATTERN.test(`${video.title || ''} ${video.description || ''}`);
}

function matchesDurationFilter(video: VideoWithNullableDuration, durationFilter: DurationFilter = 'any') {
  if (durationFilter === 'any') return true;

  const duration = video.duration;
  if (!duration || duration <= 0) return false;

  if (durationFilter === 'under-10') return duration < TEN_MINUTES_SECONDS;
  if (durationFilter === '10-30') return duration >= TEN_MINUTES_SECONDS && duration < THIRTY_MINUTES_SECONDS;
  return duration >= THIRTY_MINUTES_SECONDS;
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
    keywordText: buildKeywordText(video),
    normalizedTitle: normalizeTitle(video.title),
    isShort: isShortVideo(video),
    isLiveReplay: isLiveReplayVideo(video),
    isPremiere: isPremiereVideo(video),
  }));

  return {
    items,
    videosById: new Map(items.map((item) => [item.video.id, item])),
    mutedChannelIds,
  };
}

export function filterIndexedVideos(index: VideoFeedIndex, options: VideoFilterOptions) {
  const normalizedSearch = options.searchQuery.trim().toLowerCase();
  const mutedKeywords = normalizeKeywords(options.mutedKeywords);
  const boostedKeywords = normalizeKeywords(options.boostedKeywords);

  const filteredItems = index.items.filter((item) => {
    if (index.mutedChannelIds.has(item.video.channelId)) return false;
    if (!options.showShorts && item.isShort) return false;
    if (options.hideLiveReplays && item.isLiveReplay) return false;
    if (options.hidePremieres && item.isPremiere) return false;
    if (!matchesDurationFilter(item.video, options.durationFilter)) return false;
    if (matchesAnyKeyword(item.keywordText, mutedKeywords)) return false;
    if (normalizedSearch && !item.searchText.includes(normalizedSearch)) return false;

    return true;
  });

  const dedupedItems = options.hideDuplicateTitles
    ? filteredItems.filter((item, index, items) => {
      if (!item.normalizedTitle) return true;
      return items.findIndex((candidate) => candidate.normalizedTitle === item.normalizedTitle) === index;
    })
    : filteredItems;

  if (boostedKeywords.length === 0) return dedupedItems;

  return [
    ...dedupedItems.filter((item) => matchesAnyKeyword(item.keywordText, boostedKeywords)),
    ...dedupedItems.filter((item) => !matchesAnyKeyword(item.keywordText, boostedKeywords)),
  ];
}
