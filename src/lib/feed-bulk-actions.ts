import type { YouTubeVideo } from '../types/youtube';

type OlderThanOptions = {
  now?: number;
  days: number;
};

export function getVisibleVideoIds(videos: YouTubeVideo[]) {
  return videos.map((video) => video.id);
}

export function getVideoIdsOlderThan(videos: YouTubeVideo[], { now = Date.now(), days }: OlderThanOptions) {
  const cutoff = now - (days * 24 * 60 * 60 * 1000);

  return videos
    .filter((video) => {
      const publishedAt = new Date(video.publishedAt).getTime();
      return Number.isFinite(publishedAt) && publishedAt < cutoff;
    })
    .map((video) => video.id);
}
