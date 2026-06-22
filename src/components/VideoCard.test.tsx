import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoCard } from './VideoCard';
import { MobileLandscapeGate } from './MobileLandscapeGate';
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

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

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

  it('uses max resolution YouTube thumbnails with fallback', () => {
    render(
      <MemoryRouter>
        <VideoCard
          video={{
            ...video,
            thumbnail: 'https://i.ytimg.com/vi/video-1/hqdefault.jpg',
          }}
          index={0}
        />
      </MemoryRouter>
    );

    const thumbnail = screen.getByAltText('A useful video');

    expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/video-1/maxresdefault.jpg');

    fireEvent.error(thumbnail);

    expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/video-1/hq720.jpg');
  });

  it('skips successfully loaded low-resolution YouTube placeholders', () => {
    render(
      <MemoryRouter>
        <VideoCard
          video={{
            ...video,
            thumbnail: 'https://i.ytimg.com/vi/video-1/hqdefault.jpg',
          }}
          index={0}
        />
      </MemoryRouter>
    );

    const thumbnail = screen.getByAltText('A useful video');
    Object.defineProperty(thumbnail, 'naturalWidth', { configurable: true, value: 120 });
    Object.defineProperty(thumbnail, 'naturalHeight', { configurable: true, value: 90 });

    fireEvent.load(thumbnail);

    expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/video-1/hq720.jpg');
  });

  it('does not show a loaded grey YouTube placeholder at lower fallback sizes', () => {
    render(
      <MemoryRouter>
        <VideoCard
          video={{
            ...video,
            thumbnail: 'https://i.ytimg.com/vi/video-1/hqdefault.jpg',
          }}
          index={0}
        />
      </MemoryRouter>
    );

    const thumbnail = screen.getByAltText('A useful video');
    fireEvent.error(thumbnail);
    fireEvent.error(thumbnail);
    fireEvent.error(thumbnail);

    expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/video-1/hqdefault.jpg');

    Object.defineProperty(thumbnail, 'naturalWidth', { configurable: true, value: 120 });
    Object.defineProperty(thumbnail, 'naturalHeight', { configurable: true, value: 90 });

    fireEvent.load(thumbnail);

    expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/video-1/mqdefault.jpg');
    expect(thumbnail.className).toContain('opacity-0');
  });

  it('skips loaded grey YouTube placeholders in the Shorts thumbnail chain', () => {
    render(
      <MemoryRouter>
        <VideoCard
          video={{
            ...video,
            isShort: true,
            thumbnail: 'https://i.ytimg.com/vi/video-1/hqdefault.jpg',
          }}
          index={0}
        />
      </MemoryRouter>
    );

    const thumbnail = screen.getByAltText('A useful video');

    expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/video-1/oar2.jpg');

    Object.defineProperty(thumbnail, 'naturalWidth', { configurable: true, value: 120 });
    Object.defineProperty(thumbnail, 'naturalHeight', { configurable: true, value: 90 });

    fireEvent.load(thumbnail);

    expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/video-1/maxres2.jpg');
    expect(thumbnail.className).toContain('opacity-0');
  });

  it('uses numbered YouTube frame thumbnails before the final tiny default thumbnail', () => {
    render(
      <MemoryRouter>
        <VideoCard
          video={{
            ...video,
            thumbnail: 'https://i.ytimg.com/vi/video-1/hqdefault.jpg',
          }}
          index={0}
        />
      </MemoryRouter>
    );

    const thumbnail = screen.getByAltText('A useful video');
    fireEvent.error(thumbnail);
    fireEvent.error(thumbnail);
    fireEvent.error(thumbnail);
    fireEvent.error(thumbnail);

    expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/video-1/mqdefault.jpg');

    Object.defineProperty(thumbnail, 'naturalWidth', { configurable: true, value: 120 });
    Object.defineProperty(thumbnail, 'naturalHeight', { configurable: true, value: 90 });

    fireEvent.load(thumbnail);

    expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/video-1/0.jpg');
    expect(thumbnail.className).toContain('opacity-0');
  });

  it('skips a tiny numbered YouTube frame placeholder before hiding the inaccessible video', () => {
    render(
      <MemoryRouter>
        <VideoCard
          video={{
            ...video,
            thumbnail: 'https://i.ytimg.com/vi/video-1/hqdefault.jpg',
          }}
          index={0}
        />
      </MemoryRouter>
    );

    const thumbnail = screen.getByAltText('A useful video');
    fireEvent.error(thumbnail);
    fireEvent.error(thumbnail);
    fireEvent.error(thumbnail);
    fireEvent.error(thumbnail);

    Object.defineProperty(thumbnail, 'naturalWidth', { configurable: true, value: 120 });
    Object.defineProperty(thumbnail, 'naturalHeight', { configurable: true, value: 90 });

    fireEvent.load(thumbnail);

    expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/video-1/0.jpg');

    fireEvent.load(thumbnail);

    expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/video-1/default.jpg');

    fireEvent.load(thumbnail);

    expect(screen.queryByTestId('video-card')).not.toBeInTheDocument();
  });

  it('hides inaccessible videos that only load the final tiny YouTube placeholder', () => {
    render(
      <MemoryRouter>
        <VideoCard
          video={{
            ...video,
            thumbnail: 'https://i.ytimg.com/vi/video-1/hqdefault.jpg',
          }}
          index={0}
        />
      </MemoryRouter>
    );

    const thumbnail = screen.getByAltText('A useful video');
    fireEvent.error(thumbnail);
    fireEvent.error(thumbnail);
    fireEvent.error(thumbnail);
    fireEvent.error(thumbnail);
    fireEvent.error(thumbnail);
    fireEvent.error(thumbnail);
    fireEvent.error(thumbnail);
    fireEvent.error(thumbnail);
    fireEvent.error(thumbnail);

    expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/video-1/default.jpg');

    Object.defineProperty(thumbnail, 'naturalWidth', { configurable: true, value: 120 });
    Object.defineProperty(thumbnail, 'naturalHeight', { configurable: true, value: 90 });

    fireEvent.load(thumbnail);

    expect(screen.queryByTestId('video-card')).not.toBeInTheDocument();
  });

  it('fits Shorts thumbnails inside the video frame instead of cropping vertically', () => {
    render(
      <MemoryRouter>
        <VideoCard
          video={{
            ...video,
            isShort: true,
            thumbnail: 'https://i.ytimg.com/vi/video-1/hqdefault.jpg',
          }}
          index={0}
        />
      </MemoryRouter>
    );

    const thumbnail = screen.getByAltText('A useful video');

    expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/video-1/oar2.jpg');
    expect(thumbnail.className).toContain('object-contain');
    expect(thumbnail.className).not.toContain('object-cover');
  });

  it('uses portrait thumbnails for title-detected Shorts even without explicit metadata', () => {
    render(
      <MemoryRouter>
        <VideoCard
          video={{
            ...video,
            title: 'Quick useful video #shorts',
            thumbnail: 'https://i.ytimg.com/vi/video-1/hqdefault.jpg',
          }}
          index={0}
        />
      </MemoryRouter>
    );

    const thumbnail = screen.getByAltText('Quick useful video #shorts');

    expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/video-1/oar2.jpg');
    expect(thumbnail.className).toContain('object-contain');
    expect(thumbnail.className).not.toContain('object-cover');
  });

  it('does not probe portrait thumbnail URLs for normal untagged videos', () => {
    render(
      <MemoryRouter>
        <VideoCard
          video={{
            ...video,
            title: 'Harry Maguire Said NO!',
            thumbnail: 'https://i.ytimg.com/vi/l3GdJvnYRaU/hqdefault.jpg',
          }}
          index={0}
        />
      </MemoryRouter>
    );

    const thumbnail = screen.getByAltText('Harry Maguire Said NO!');

    expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/l3GdJvnYRaU/maxresdefault.jpg');
    expect(thumbnail.className).toContain('object-cover');
    expect(thumbnail.className).not.toContain('object-contain');
  });

  it('keeps normal thumbnails on the max resolution landscape fallback chain', () => {
    render(
      <MemoryRouter>
        <VideoCard
          video={{
            ...video,
            thumbnail: 'https://i.ytimg.com/vi/video-1/hqdefault.jpg',
          }}
          index={0}
        />
      </MemoryRouter>
    );

    const thumbnail = screen.getByAltText('A useful video');

    fireEvent.error(thumbnail);

    expect(thumbnail).toHaveAttribute('src', 'https://i.ytimg.com/vi/video-1/hq720.jpg');
    expect(thumbnail.className).toContain('object-cover');
    expect(thumbnail.className).not.toContain('object-contain');
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

  it('does not navigate away when the title is clicked', () => {
    vi.stubGlobal('scrollY', 432);

    render(
      <MemoryRouter initialEntries={['/?tab=latest']}>
        <>
          <VideoCard video={video} index={0} />
          <LocationProbe />
        </>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('A useful video'));

    expect(sessionStorage.getItem('latest-videos-scroll')).toBeNull();
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('plays the video inline when the thumbnail is clicked', () => {
    render(
      <MemoryRouter initialEntries={['/?tab=latest']}>
        <>
          <VideoCard video={video} index={0} />
          <LocationProbe />
        </>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play A useful video inline' }));

    const inlinePlayer = screen.getByTitle('A useful video player');
    expect(inlinePlayer).toHaveAttribute('data-testid', 'inline-video-player');
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('keeps the expanded inline player mounted and playing when the phone rotates to landscape', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 844,
    });
    const lock = vi.fn().mockResolvedValue(undefined);
    const unlock = vi.fn();
    Object.defineProperty(window.screen, 'orientation', {
      configurable: true,
      value: { lock, unlock },
    });
    const playerConstructed = vi.fn();
    const destroy = vi.fn();
    window.YT = {
      PlayerState: { ENDED: 0 },
      Player: class {
        constructor() {
          playerConstructed();
        }

        destroy = destroy;
      },
    } as any;

    render(
      <MemoryRouter initialEntries={['/?tab=latest']}>
        <MobileLandscapeGate>
          <>
            <VideoCard video={video} index={0} />
            <LocationProbe />
          </>
        </MobileLandscapeGate>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play A useful video inline' }));
    await waitFor(() => {
      expect(playerConstructed).toHaveBeenCalled();
    });

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 932,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 430,
    });
    fireEvent(window, new Event('resize'));

    expect(screen.queryByText('Rotate back to portrait')).not.toBeInTheDocument();
    expect(screen.queryByText('Dedicated now playing')).not.toBeInTheDocument();
    expect(screen.getByTestId('inline-video-player')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/');
    expect(playerConstructed).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
    expect(lock).toHaveBeenCalledWith('portrait');
  });

  it('saves inline playback progress so queued videos can resume', async () => {
    window.YT = {
      PlayerState: { ENDED: 0 },
      Player: class {
        constructor(_element: HTMLElement, options: any) {
          window.setTimeout(() => options.events.onReady({ target: this }), 0);
        }

        getCurrentTime = () => 45;
        getDuration = () => 120;
        destroy = vi.fn();
        seekTo = vi.fn();
        playVideo = vi.fn();
      },
    };

    render(
      <MemoryRouter initialEntries={['/?tab=latest']}>
        <>
          <VideoCard video={video} index={0} />
          <LocationProbe />
        </>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play A useful video inline' }));

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('video-playback-progress') || '{}')).toMatchObject({
        'video-1': {
          currentTime: 45,
          duration: 120,
        },
      });
    });
    expect(mockStore.markAsWatched).toHaveBeenCalledWith('video-1');
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('keeps the inline player visible when playback ends', async () => {
    const destroy = vi.fn();
    let signalEnded: (() => void) | undefined;
    window.YT = {
      PlayerState: { ENDED: 0 },
      Player: class {
        constructor(_element: HTMLElement, options: any) {
          signalEnded = () => options.events.onStateChange({ target: this, data: 0 });
        }

        getCurrentTime = () => 120;
        getDuration = () => 120;
        destroy = destroy;
        seekTo = vi.fn();
        playVideo = vi.fn();
      },
    } as any;

    render(
      <MemoryRouter initialEntries={['/?tab=latest']}>
        <VideoCard video={video} index={0} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play A useful video inline' }));
    await waitFor(() => {
      expect(signalEnded).toBeTypeOf('function');
    });

    act(() => {
      signalEnded?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId('inline-video-player')).toBeInTheDocument();
      expect(destroy).not.toHaveBeenCalled();
    });
  });

  it('does not overwrite inline resume progress with the player startup time', async () => {
    localStorage.setItem('video-playback-progress', JSON.stringify({
      'video-1': {
        currentTime: 75,
        duration: 300,
        updatedAt: Date.now(),
      },
    }));
    window.YT = {
      PlayerState: { ENDED: 0 },
      Player: class {
        constructor(_element: HTMLElement, options: any) {
          window.setTimeout(() => options.events.onReady({ target: this }), 0);
        }

        getCurrentTime = () => 0;
        getDuration = () => 300;
        destroy = vi.fn();
        seekTo = vi.fn();
        playVideo = vi.fn();
      },
    };

    render(
      <MemoryRouter initialEntries={['/?tab=queue']}>
        <>
          <VideoCard video={video} index={0} />
          <LocationProbe />
        </>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play A useful video inline' }));

    await waitFor(() => {
      expect(screen.getByTitle('A useful video player')).toBeInTheDocument();
    });
    expect(JSON.parse(localStorage.getItem('video-playback-progress') || '{}')).toMatchObject({
      'video-1': {
        currentTime: 75,
        duration: 300,
      },
    });
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

  it('shows a watched badge when the video is watched', () => {
    mockStore.watchedVideos = new Set(['video-1']);

    render(
      <MemoryRouter>
        <VideoCard video={video} index={0} />
      </MemoryRouter>
    );

    expect(screen.getByText('Watched')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark video as unwatched' })).toBeInTheDocument();
  });

  it('marks a video watched when swiped left without opening it', () => {
    render(
      <MemoryRouter initialEntries={['/?tab=latest']}>
        <>
          <VideoCard video={video} index={0} />
          <LocationProbe />
        </>
      </MemoryRouter>
    );

    const card = screen.getByTestId('video-card');

    fireEvent.pointerDown(card, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 112,
      clientY: 20,
    });
    fireEvent.pointerMove(card, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 12,
      clientY: 22,
    });

    expect(screen.getByText('Mark watched')).toBeInTheDocument();

    fireEvent.pointerUp(card, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 12,
      clientY: 22,
    });

    expect(mockStore.markAsWatched).toHaveBeenCalledWith('video-1');
  });

  it('does not treat vertical scrolling as a watched swipe', () => {
    render(
      <MemoryRouter>
        <VideoCard video={video} index={0} />
      </MemoryRouter>
    );

    const card = screen.getByTestId('video-card');

    fireEvent.pointerDown(card, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 12,
      clientY: 20,
    });
    fireEvent.pointerMove(card, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 24,
      clientY: 90,
    });
    fireEvent.pointerUp(card, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 24,
      clientY: 90,
    });

    expect(mockStore.markAsWatched).not.toHaveBeenCalled();
  });

  it('queues a video when swiped right without favoriting it', () => {
    render(
      <MemoryRouter>
        <VideoCard video={video} index={0} />
      </MemoryRouter>
    );

    const card = screen.getByTestId('video-card');

    fireEvent.pointerDown(card, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 12,
      clientY: 20,
    });
    fireEvent.pointerMove(card, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 112,
      clientY: 22,
    });

    expect(screen.getByText('Add to queue')).toBeInTheDocument();

    fireEvent.pointerUp(card, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 112,
      clientY: 22,
    });

    expect(JSON.parse(localStorage.getItem('queued-video-ids') || '[]')).toEqual(['video-1']);
    expect(JSON.parse(localStorage.getItem('favorite-video-ids') || '[]')).toEqual([]);
  });

  it('can queue a video without favoriting it', () => {
    render(
      <MemoryRouter>
        <VideoCard video={video} index={0} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add video to queue' }));

    expect(JSON.parse(localStorage.getItem('queued-video-ids') || '[]')).toEqual(['video-1']);
    expect(JSON.parse(localStorage.getItem('favorite-video-ids') || '[]')).toEqual([]);
    expect(screen.getByRole('button', { name: 'Remove video from queue' })).toBeInTheDocument();
  });

  it('visually deselects the queue button on the second tap', () => {
    render(
      <MemoryRouter>
        <VideoCard video={video} index={0} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add video to queue' }));
    const queuedButton = screen.getByRole('button', { name: 'Remove video from queue' });

    expect(queuedButton.className).toContain('text-blue-500');

    fireEvent.click(queuedButton);

    const unqueuedButton = screen.getByRole('button', { name: 'Add video to queue' });
    expect(unqueuedButton.className).toContain('text-gray-400');
    expect(unqueuedButton.className).not.toContain('bg-blue-600/10');
    expect(JSON.parse(localStorage.getItem('queued-video-ids') || '[]')).toEqual([]);
  });

  it('places the favorite button at the bottom right of the details area', () => {
    render(
      <MemoryRouter>
        <VideoCard video={video} index={0} />
      </MemoryRouter>
    );

    const favoriteButton = screen.getByRole('button', { name: 'Add video to favorites' });
    const queueButton = screen.getByRole('button', { name: 'Add video to queue' });
    expect(screen.getByTestId('video-card-info')).toContainElement(favoriteButton);
    expect(screen.getByTestId('video-card-info')).toContainElement(queueButton);
    expect(favoriteButton.className).toContain('absolute');
    expect(favoriteButton.className).toContain('bottom-3');
    expect(favoriteButton.className).toContain('right-3');
    expect(queueButton.className).toContain('right-14');
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

  it('updates the bottom progress bar when playback progress changes', async () => {
    render(
      <MemoryRouter>
        <VideoCard video={video} index={0} />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('video-progress-bar')).not.toBeInTheDocument();

    localStorage.setItem('video-playback-progress', JSON.stringify({
      'video-1': {
        currentTime: 60,
        duration: 120,
        updatedAt: Date.now(),
      },
    }));
    fireEvent(window, new Event('video-progress-changed'));

    const progressBar = await screen.findByTestId('video-progress-bar');
    expect(progressBar).toHaveStyle({ width: '50%' });
  });

  it('shows a red LIVE overlay for live videos', () => {
    render(
      <MemoryRouter>
        <VideoCard
          video={{
            ...video,
            title: 'LIVE: Breaking news',
            liveBroadcastContent: 'live',
          }}
          index={0}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('does not show the LIVE overlay for livestream replays', () => {
    render(
      <MemoryRouter>
        <VideoCard
          video={{
            ...video,
            title: 'Match livestream replay',
            description: 'Recorded earlier',
          }}
          index={0}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });
});
