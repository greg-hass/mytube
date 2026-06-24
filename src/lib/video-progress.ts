const STORAGE_KEY = 'video-playback-progress';
const FINISHED_PERCENT = 0.95;
const FINISHED_REMAINING_SECONDS = 10;

export interface VideoProgress {
  currentTime: number;
  duration: number;
  updatedAt: number;
  // User explicitly removed this video from Continue Watching.
  // Auto-clears via saveVideoProgress the next time the user starts a
  // session from Latest (a deliberate re-engagement). The Dashboard
  // applies its own grace window for storage-cleanup scenarios.
  removedAt?: number;
}

type VideoProgressStore = Record<string, VideoProgress>;

function readProgressStore(): VideoProgressStore {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : {};
    return parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
      ? parsedValue
      : {};
  } catch {
    return {};
  }
}

function writeProgressStore(store: VideoProgressStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event('video-progress-changed'));
}

export function getVideoProgress(videoId: string): VideoProgress | null {
  const progress = readProgressStore()[videoId];
  if (
    !progress ||
    typeof progress.currentTime !== 'number' ||
    typeof progress.duration !== 'number' ||
    progress.currentTime <= 0 ||
    progress.duration <= 0
  ) {
    return null;
  }

  return progress;
}

export function getAllVideoProgress(): VideoProgressStore {
  return readProgressStore();
}

export function getVideoProgressPercent(videoId: string): number {
  const progress = getVideoProgress(videoId);
  if (!progress) return 0;

  return Math.min(100, Math.max(0, (progress.currentTime / progress.duration) * 100));
}

export function clearVideoProgress(videoId: string) {
  const store = readProgressStore();
  delete store[videoId];
  writeProgressStore(store);
}

// Marks a video as user-removed from Continue Watching. Keeps the progress
// data intact so we can still compute "you watched 12 minutes of this" for
// any UI that wants to show it, but the Dashboard will skip it until the
// user re-engages from Latest (which writes a fresh progress entry and
// drops the flag).
export function markVideoProgressRemoved(videoId: string) {
  const store = readProgressStore();
  const existing = store[videoId];
  if (!existing) return;
  store[videoId] = { ...existing, removedAt: Date.now() };
  writeProgressStore(store);
}

export function saveVideoProgress(videoId: string, currentTime: number, duration: number) {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return;

  const remainingSeconds = duration - currentTime;
  const percentWatched = currentTime / duration;

  if (percentWatched >= FINISHED_PERCENT || remainingSeconds <= FINISHED_REMAINING_SECONDS) {
    clearVideoProgress(videoId);
    return;
  }

  const store = readProgressStore();
  store[videoId] = {
    currentTime: Math.max(0, currentTime),
    duration,
    updatedAt: Date.now(),
    // Re-engaging with a previously-removed video clears the flag, so it
    // reappears in Continue Watching on the next Dashboard render.
    removedAt: undefined,
  };
  writeProgressStore(store);
}
