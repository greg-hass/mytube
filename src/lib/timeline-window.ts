import type { YouTubeVideo } from '../types/youtube';

export const MOBILE_TIMELINE_INITIAL_LIMIT = 300;
export const MOBILE_TIMELINE_INCREMENT = 200;

interface TimelineWindowOptions {
  isMobile: boolean;
  searchQuery: string;
  visibleCount: number;
}

export function getVisibleTimelineVideos(
  videos: YouTubeVideo[],
  { isMobile, searchQuery, visibleCount }: TimelineWindowOptions
) {
  if (!isMobile || searchQuery.trim()) return videos;
  return videos.slice(0, visibleCount);
}
