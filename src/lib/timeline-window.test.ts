import { describe, expect, it } from 'vitest';
import { getVisibleTimelineVideos, MOBILE_TIMELINE_INITIAL_LIMIT } from './timeline-window';
import type { YouTubeVideo } from '../types/youtube';

const videos = Array.from({ length: MOBILE_TIMELINE_INITIAL_LIMIT + 25 }, (_, index): YouTubeVideo => ({
  id: `video-${index}`,
  title: `Video ${index}`,
  description: '',
  thumbnail: '',
  channelId: 'UC123',
  channelTitle: 'Test Channel',
  publishedAt: new Date(2026, 4, 6, 12, index).toISOString(),
}));

describe('timeline windowing', () => {
  it('keeps the initial mobile timeline to a recent window', () => {
    const visible = getVisibleTimelineVideos(videos, {
      isMobile: true,
      searchQuery: '',
      visibleCount: MOBILE_TIMELINE_INITIAL_LIMIT,
    });

    expect(visible).toHaveLength(MOBILE_TIMELINE_INITIAL_LIMIT);
    expect(visible[0].id).toBe('video-0');
  });

  it('does not hide results while searching or on desktop', () => {
    expect(getVisibleTimelineVideos(videos, {
      isMobile: true,
      searchQuery: 'linux',
      visibleCount: MOBILE_TIMELINE_INITIAL_LIMIT,
    })).toHaveLength(videos.length);

    expect(getVisibleTimelineVideos(videos, {
      isMobile: false,
      searchQuery: '',
      visibleCount: MOBILE_TIMELINE_INITIAL_LIMIT,
    })).toHaveLength(videos.length);
  });
});
