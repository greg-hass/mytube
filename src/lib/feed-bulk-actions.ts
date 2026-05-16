import type { YouTubeVideo } from '../types/youtube';

type OlderThanOptions = {
  now?: number;
  days: number;
};

export function getVisibleVideoIds(videos: readonly YouTubeVideo[]): string[] {
  return videos.map((video) => video.id);
}

export function getVideoIdsOlderThan(
  videos: readonly YouTubeVideo[],
  { now = Date.now(), days }: OlderThanOptions,
): string[] {
  const cutoff = now - (days * 24 * 60 * 60 * 1000);

  return videos
    .filter((video) => {
      const publishedAt = new Date(video.publishedAt).getTime();
      return Number.isFinite(publishedAt) && publishedAt < cutoff;
    })
    .map((video) => video.id);
}
