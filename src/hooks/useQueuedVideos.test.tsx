import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQueuedVideos } from './useQueuedVideos';
import type { YouTubeVideo } from '../types/youtube';

const video: YouTubeVideo = {
  id: 'video-1',
  title: 'Watch this later',
  description: '',
  thumbnail: 'https://example.com/video.jpg',
  channelId: 'UC123',
  channelTitle: 'Useful Channel',
  publishedAt: new Date().toISOString(),
};

function QueueHarness() {
  const { queuedVideos, isQueuedVideo, toggleQueuedVideo, removeQueuedVideo } = useQueuedVideos();

  return (
    <div>
      <button type="button" onClick={() => toggleQueuedVideo(video)}>
        Toggle queue
      </button>
      <button
        type="button"
        onClick={() => {
          toggleQueuedVideo(video);
          toggleQueuedVideo(video);
        }}
      >
        Toggle queue twice
      </button>
      <button type="button" onClick={() => removeQueuedVideo(video.id)}>
        Remove queue
      </button>
      <p>{isQueuedVideo(video.id) ? 'Queued' : 'Not queued'}</p>
      <p>{queuedVideos.map((queuedVideo) => queuedVideo.title).join(', ') || 'No queued videos'}</p>
    </div>
  );
}

describe('useQueuedVideos', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    });
  });

  it('persists full videos separately from favorites when queued', () => {
    render(<QueueHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle queue' }));

    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.getByText('Watch this later')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('queued-video-ids') || '[]')).toEqual(['video-1']);
    expect(JSON.parse(localStorage.getItem('queued-videos') || '[]')).toMatchObject([
      {
        id: 'video-1',
        title: 'Watch this later',
      },
    ]);
    expect(localStorage.getItem('favorite-video-ids')).toBeNull();
  });

  it('removes queued videos without disturbing favorites', () => {
    localStorage.setItem('favorite-video-ids', JSON.stringify(['video-1']));
    localStorage.setItem('queued-video-ids', JSON.stringify(['video-1']));
    localStorage.setItem('queued-videos', JSON.stringify([video]));

    render(<QueueHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove queue' }));

    expect(screen.getByText('Not queued')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('queued-video-ids') || '[]')).toEqual([]);
    expect(JSON.parse(localStorage.getItem('queued-videos') || '[]')).toEqual([]);
    expect(JSON.parse(localStorage.getItem('favorite-video-ids') || '[]')).toEqual(['video-1']);
  });

  it('treats a rapid second toggle as a remove', () => {
    render(<QueueHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle queue twice' }));

    expect(screen.getByText('Not queued')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('queued-video-ids') || '[]')).toEqual([]);
    expect(JSON.parse(localStorage.getItem('queued-videos') || '[]')).toEqual([]);
  });
});
