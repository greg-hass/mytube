import type { YouTubeVideo } from '../types/youtube';

const LIVE_REPLAY_TEXT_PATTERN = /\b(replay|recorded|full\s+stream|stream\s+replay|livestream\s+replay)\b/i;
const LIVE_TEXT_PATTERN = /(^|\s)(?:🔴\s*)?(?:live\s*:|\[live\]|\(live\)|live\s+now\b|watch\s+live\b|streaming\s+live\b|is\s+live\b)/i;

export function isLiveVideo(video: Pick<YouTubeVideo, 'title' | 'description' | 'isLive' | 'liveBroadcastContent'>) {
  if (video.isLive || video.liveBroadcastContent === 'live') return true;
  if (video.liveBroadcastContent === 'none') return false;

  const text = `${video.title || ''} ${video.description || ''}`;
  if (LIVE_REPLAY_TEXT_PATTERN.test(text)) return false;

  return LIVE_TEXT_PATTERN.test(text);
}
