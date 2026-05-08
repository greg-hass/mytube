import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoCard } from './VideoCard';
import type { YouTubeVideo } from '../types/youtube';

const mockStore = vi.hoisted(() => ({
  watchedVideos: new Set<string>(),
  markAsWatched: vi.fn(),
  markAsUnwatched: vi.fn(),
}));

vi.mock('../store/useStore', () => ({
  useStore: () => mockStore,
}));

const video: YouTubeVideo = {
  id: 'video-1',
  title: 'A useful video',
  description: '',
  thumbnail: 'https://example.com/video.jpg',
  channelId: 'UC123',
  channelTitle: 'Useful Channel',
  publishedAt: new Date().toISOString(),
};

describe('VideoCard', () => {
  beforeEach(() => {
    mockStore.watchedVideos = new Set<string>();
    mockStore.markAsWatched.mockClear();
    mockStore.markAsUnwatched.mockClear();
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    });
  });

  it('shows the channel icon before the channel title', () => {
    render(
      <MemoryRouter>
        <VideoCard
          video={video}
          index={0}
          channelThumbnail="https://example.com/channel.jpg"
        />
      </MemoryRouter>
    );

    const channelIcon = screen.getByAltText('Useful Channel icon');
    const channelTitle = screen.getByText('Useful Channel');

    expect(channelIcon).toBeInTheDocument();
    expect(channelIcon.compareDocumentPosition(channelTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not add index-based render animation to dense timeline cards', () => {
    const { container } = render(
      <MemoryRouter>
        <VideoCard video={video} index={500} />
      </MemoryRouter>
    );

    const card = container.firstElementChild;

    expect(card).toBeInTheDocument();
    expect(card?.className).not.toContain('transition-all');
  });

  it('can favorite a video without opening it', () => {
    render(
      <MemoryRouter>
        <VideoCard video={video} index={0} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add video to favorites' }));

    expect(JSON.parse(localStorage.getItem('favorite-video-ids') || '[]')).toEqual(['video-1']);
    expect(screen.getByRole('button', { name: 'Remove video from favorites' })).toBeInTheDocument();
  });

  it('can mark a video watched without opening it', () => {
    render(
      <MemoryRouter>
        <VideoCard video={video} index={0} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mark video as watched' }));

    expect(mockStore.markAsWatched).toHaveBeenCalledWith('video-1');
  });

  it('places the favorite button at the bottom right of the details area', () => {
    render(
      <MemoryRouter>
        <VideoCard video={video} index={0} />
      </MemoryRouter>
    );

    const favoriteButton = screen.getByRole('button', { name: 'Add video to favorites' });
    expect(screen.getByTestId('video-card-info')).toContainElement(favoriteButton);
    expect(favoriteButton.className).toContain('absolute');
    expect(favoriteButton.className).toContain('bottom-3');
    expect(favoriteButton.className).toContain('right-3');
    expect(favoriteButton.className).not.toContain('-mb-');
    expect(favoriteButton.className).not.toContain('-mr-');
  });

  it('shows a bottom progress bar when the video has saved playback progress', () => {
    localStorage.setItem('video-playback-progress', JSON.stringify({
      'video-1': {
        currentTime: 30,
        duration: 120,
        updatedAt: Date.now(),
      },
    }));

    render(
      <MemoryRouter>
        <VideoCard video={video} index={0} />
      </MemoryRouter>
    );

    const progressBar = screen.getByTestId('video-progress-bar');

    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveStyle({ width: '25%' });
  });
});
