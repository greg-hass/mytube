import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFavoriteVideos } from './useFavoriteVideos';
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
});
