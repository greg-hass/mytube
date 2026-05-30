import type { YouTubeVideo } from '../types/youtube';

export function readRawStorage(key: string) {
  if (typeof localStorage === 'undefined') return null;

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function parseVideoIds(rawValue: string | null) {
  try {
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsedValue) ? parsedValue.filter((id: unknown): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function isYouTubeVideo(value: unknown): value is YouTubeVideo {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.thumbnail === 'string' &&
    typeof candidate.channelId === 'string' &&
    typeof candidate.channelTitle === 'string' &&
    typeof candidate.publishedAt === 'string'
  );
}

export function parseVideos(rawValue: string | null) {
  try {
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsedValue) ? parsedValue.filter(isYouTubeVideo) : [];
  } catch {
    return [];
  }
}
