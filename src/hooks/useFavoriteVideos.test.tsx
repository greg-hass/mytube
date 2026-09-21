import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFavoriteVideos, removeFavoriteVideosByChannel } from './useFavoriteVideos';
import type { YouTubeVideo } from '../types/youtube';

const video: YouTubeVideo = {
  id: 'video-1',
  title: 'A favorite from Latest',
  description: '',
  thumbnail: 'https://example.com/video.jpg',
  channelId: 'UC123',
  channelTitle: 'Useful Channel',
  publishedAt: new Date().toISOString(),
};

function FavoriteHarness() {
  const { favoriteVideos, isFavoriteVideo, toggleFavoriteVideo } = useFavoriteVideos();

  return (
    <div>
      <button type="button" onClick={() => toggleFavoriteVideo(video)}>
        Toggle favorite
      </button>
      <p>{isFavoriteVideo(video.id) ? 'Favorited' : 'Not favorited'}</p>
      <p>{favoriteVideos.map((favorite) => favorite.title).join(', ') || 'No favorites'}</p>
    </div>
  );
}

describe('useFavoriteVideos', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    });
  });

  it('persists the full video when favoriting from the timeline', () => {
    render(<FavoriteHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle favorite' }));

    expect(screen.getByText('Favorited')).toBeInTheDocument();
    expect(screen.getByText('A favorite from Latest')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('favorite-video-ids') || '[]')).toEqual(['video-1']);
    expect(JSON.parse(localStorage.getItem('favorite-videos') || '[]')).toMatchObject([
      {
        id: 'video-1',
        title: 'A favorite from Latest',
      },
    ]);
  });

  it('removes every favorite for a channel when the channel is purged', () => {
    const otherChannelVideo: YouTubeVideo = {
      ...video,
      id: 'video-2',
      channelId: 'UC456',
      channelTitle: 'Other Channel',
      title: 'Another favorite',
    };

    function MultiFavoriteHarness() {
      const { favoriteVideos, toggleFavoriteVideo } = useFavoriteVideos();
      return (
        <div>
          <button type="button" onClick={() => toggleFavoriteVideo(video)}>
            Toggle first
          </button>
          <button type="button" onClick={() => toggleFavoriteVideo(otherChannelVideo)}>
            Toggle second
          </button>
          <p>{favoriteVideos.map((favorite) => favorite.title).join(', ') || 'No favorites'}</p>
        </div>
      );
    }

    render(<MultiFavoriteHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle first' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle second' }));
    expect(screen.getByText('A favorite from Latest, Another favorite')).toBeInTheDocument();

    act(() => {
      removeFavoriteVideosByChannel('UC123');
    });

    expect(screen.getByText('Another favorite')).toBeInTheDocument();
    expect(screen.queryByText('A favorite from Latest, Another favorite')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('favorite-video-ids') || '[]')).toEqual(['video-2']);
    expect(JSON.parse(localStorage.getItem('favorite-videos') || '[]')).toMatchObject([
      { id: 'video-2' },
    ]);
  });

  it('shares decoded favorites across consumers and refreshes after external storage updates', () => {
    localStorage.setItem('favorite-videos', JSON.stringify([video, video]));
    const first = renderHook(() => useFavoriteVideos());
    const second = renderHook(() => useFavoriteVideos());
    expect(first.result.current.favoriteVideos).toHaveLength(1);
    expect(second.result.current.favoriteVideos).toBe(first.result.current.favoriteVideos);

    act(() => {
      localStorage.setItem('favorite-videos', JSON.stringify([{ ...video, title: 'Restored title' }]));
      window.dispatchEvent(new Event('favorite-videos-changed'));
    });
    expect(first.result.current.favoriteVideos[0].title).toBe('Restored title');
    expect(second.result.current.favoriteVideos).toBe(first.result.current.favoriteVideos);

    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage'));
    });
    expect(first.result.current.favoriteVideoIds.size).toBe(0);
    expect(second.result.current.favoriteVideos).toEqual([]);
  });
});
