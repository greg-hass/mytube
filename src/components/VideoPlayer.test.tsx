import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoPlayer } from './VideoPlayer';

const mockMarkAsWatched = vi.hoisted(() => vi.fn());
const mockMarkAsUnwatched = vi.hoisted(() => vi.fn());
const mockToggleFavoriteVideo = vi.hoisted(() => vi.fn());
const mockToggleQueuedVideo = vi.hoisted(() => vi.fn());
const mockUseRSSVideos = vi.hoisted(() => vi.fn());
const mockUseSubscriptionStorage = vi.hoisted(() => vi.fn());
const mockUseFavoriteVideos = vi.hoisted(() => vi.fn());
const mockUseQueuedVideos = vi.hoisted(() => vi.fn());
const watchedVideos = vi.hoisted(() => new Set<string>());

vi.mock('../store/useStore', () => ({
  useStore: (selector?: (state: {
    watchedVideos: Set<string>;
    markAsWatched: typeof mockMarkAsWatched;
    markAsUnwatched: typeof mockMarkAsUnwatched;
  }) => unknown) => {
    const state = {
      watchedVideos,
      markAsWatched: mockMarkAsWatched,
      markAsUnwatched: mockMarkAsUnwatched,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../hooks/useRSSVideos', () => ({
  useRSSVideos: () => mockUseRSSVideos(),
}));

vi.mock('../hooks/useSubscriptionStorage', () => ({
  useSubscriptionStorage: () => mockUseSubscriptionStorage(),
}));

vi.mock('../hooks/useFavoriteVideos', () => ({
  useFavoriteVideos: () => mockUseFavoriteVideos(),
}));

vi.mock('../hooks/useQueuedVideos', () => ({
  useQueuedVideos: () => mockUseQueuedVideos(),
}));

vi.mock('./Header', () => ({
  Header: () => <header>Header</header>,
}));

vi.mock('framer-motion', () => ({
  motion: {
    button: ({ animate, children, initial, transition, ...props }: any) => {
      void animate;
      void initial;
      void transition;
      return <button {...props}>{children}</button>;
    },
    div: ({ animate, children, initial, transition, ...props }: any) => {
      void animate;
      void initial;
      void transition;
      return <div {...props}>{children}</div>;
    },
    section: ({ animate, children, initial, transition, ...props }: any) => {
      void animate;
      void initial;
      void transition;
      return <section {...props}>{children}</section>;
    },
  },
}));

describe('VideoPlayer', () => {
  const currentVideo = {
    id: 'video-1',
    title: 'Current video',
    description: '',
    thumbnail: 'https://i.ytimg.com/vi/video-1/hqdefault.jpg',
    channelId: 'channel-1',
    channelTitle: 'Channel One',
    publishedAt: '2026-05-09T10:00:00.000Z',
    duration: 600,
  };
  const previousVideo = {
    id: 'video-0',
    title: 'Previous video',
    description: '',
    thumbnail: 'https://i.ytimg.com/vi/video-0/hqdefault.jpg',
    channelId: 'channel-2',
    channelTitle: 'Channel Two',
    publishedAt: '2026-05-09T09:00:00.000Z',
  };
  const nextVideo = {
    id: 'video-2',
    title: 'Next video',
    description: '',
    thumbnail: 'https://i.ytimg.com/vi/video-2/hqdefault.jpg',
    channelId: 'channel-2',
    channelTitle: 'Channel Two',
    publishedAt: '2026-05-09T11:00:00.000Z',
  };
  const relatedVideo = {
    id: 'video-3',
    title: 'Related video',
    description: '',
    thumbnail: 'https://i.ytimg.com/vi/video-3/hqdefault.jpg',
    channelId: 'channel-1',
    channelTitle: 'Channel One',
    publishedAt: '2026-05-08T10:00:00.000Z',
  };

  beforeEach(() => {
    mockMarkAsWatched.mockClear();
    mockMarkAsUnwatched.mockClear();
    mockToggleFavoriteVideo.mockClear();
    mockToggleQueuedVideo.mockClear();
    watchedVideos.clear();
    vi.stubGlobal('scrollTo', vi.fn());
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    });
    window.YT = undefined;
    mockUseRSSVideos.mockReturnValue({
      videos: [previousVideo, currentVideo, nextVideo, relatedVideo],
    });
    mockUseSubscriptionStorage.mockReturnValue({
      allSubscriptions: [
        {
          id: 'channel-1',
          title: 'Channel One',
          description: '',
          thumbnail: 'https://example.com/channel-one.jpg',
        },
      ],
    });
    mockUseFavoriteVideos.mockReturnValue({
      favoriteVideos: [],
      isFavoriteVideo: () => false,
      toggleFavoriteVideo: mockToggleFavoriteVideo,
    });
    mockUseQueuedVideos.mockReturnValue({
      queuedVideos: [],
      isQueuedVideo: () => false,
      toggleQueuedVideo: mockToggleQueuedVideo,
    });
  });

  it('opens at the top so the back button is not hidden under the header', async () => {
    render(
      <MemoryRouter initialEntries={['/video/video-1']}>
        <Routes>
          <Route path="/video/:videoId" element={<VideoPlayer />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
    });
  });

  it('marks a video watched after enough playback progress is recorded', async () => {
    window.YT = {
      PlayerState: { ENDED: 0 },
      Player: class {
        constructor(_element: HTMLElement, options: any) {
          window.setTimeout(() => options.events.onReady({ target: this }), 0);
        }

        getCurrentTime = () => 31;
        getDuration = () => 100;
        destroy = vi.fn();
        seekTo = vi.fn();
        playVideo = vi.fn();
      },
    };

    render(
      <MemoryRouter initialEntries={['/video/video-1']}>
        <Routes>
          <Route path="/video/:videoId" element={<VideoPlayer />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockMarkAsWatched).toHaveBeenCalledWith('video-1');
    });
  });

  it('resumes a queued-only video from saved playback progress', async () => {
    let playerVars: Record<string, string | number> | undefined;
    const seekTo = vi.fn();
    localStorage.setItem('video-playback-progress', JSON.stringify({
      'queued-only-video': {
        currentTime: 75,
        duration: 300,
        updatedAt: Date.now(),
      },
    }));
    mockUseRSSVideos.mockReturnValue({
      videos: [],
    });
    mockUseQueuedVideos.mockReturnValue({
      queuedVideos: [{
        ...currentVideo,
        id: 'queued-only-video',
        title: 'Queued only video',
      }],
      isQueuedVideo: (videoId: string) => videoId === 'queued-only-video',
      toggleQueuedVideo: mockToggleQueuedVideo,
    });
    window.YT = {
      PlayerState: { ENDED: 0 },
      Player: class {
        constructor(_element: HTMLElement, options: any) {
          playerVars = options.playerVars;
          window.setTimeout(() => options.events.onReady({ target: this }), 0);
        }

        getCurrentTime = () => 75;
        getDuration = () => 300;
        destroy = vi.fn();
        seekTo = seekTo;
        playVideo = vi.fn();
      },
    };

    render(
      <MemoryRouter initialEntries={['/video/queued-only-video']}>
        <Routes>
          <Route path="/video/:videoId" element={<VideoPlayer />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Queued only video' })).toBeInTheDocument();
    expect(screen.getByText('Resuming from 1:15')).toBeInTheDocument();
    await waitFor(() => {
      expect(seekTo).toHaveBeenCalledWith(75, true);
    });
    expect(playerVars?.start).toBe(75);
  });

  it('does not overwrite queued resume progress with the player startup time', async () => {
    localStorage.setItem('video-playback-progress', JSON.stringify({
      'queued-only-video': {
        currentTime: 75,
        duration: 300,
        updatedAt: Date.now(),
      },
    }));
    mockUseRSSVideos.mockReturnValue({
      videos: [],
    });
    mockUseQueuedVideos.mockReturnValue({
      queuedVideos: [{
        ...currentVideo,
        id: 'queued-only-video',
        title: 'Queued only video',
      }],
      isQueuedVideo: (videoId: string) => videoId === 'queued-only-video',
      toggleQueuedVideo: mockToggleQueuedVideo,
    });
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
      <MemoryRouter initialEntries={['/video/queued-only-video']}>
        <Routes>
          <Route path="/video/:videoId" element={<VideoPlayer />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Resuming from 1:15')).toBeInTheDocument();
    });
    expect(JSON.parse(localStorage.getItem('video-playback-progress') || '{}')).toMatchObject({
      'queued-only-video': {
        currentTime: 75,
        duration: 300,
      },
    });
  });

  it('allows the YouTube iframe to use fullscreen and picture-in-picture when supported', async () => {
    const iframe = document.createElement('iframe');

    window.YT = {
      PlayerState: { ENDED: 0 },
      Player: class {
        constructor(_element: HTMLElement, options: any) {
          window.setTimeout(() => options.events.onReady({ target: this }), 0);
        }

        getCurrentTime = () => 0;
        getDuration = () => 100;
        destroy = vi.fn();
        seekTo = vi.fn();
        playVideo = vi.fn();
        getIframe = () => iframe;
      },
    };

    render(
      <MemoryRouter initialEntries={['/video/video-1']}>
        <Routes>
          <Route path="/video/:videoId" element={<VideoPlayer />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(iframe.getAttribute('allow')).toContain('picture-in-picture');
    });

    expect(iframe.getAttribute('allow')).toContain('autoplay');
    expect(iframe.getAttribute('allowfullscreen')).toBe('');
    expect(iframe.getAttribute('webkitallowfullscreen')).toBe('');
  });

  it('requests 1080p playback quality when the player is ready', async () => {
    const setPlaybackQuality = vi.fn();
    let playerVars: Record<string, string | number> | undefined;

    window.YT = {
      PlayerState: { ENDED: 0 },
      Player: class {
        constructor(_element: HTMLElement, options: any) {
          playerVars = options.playerVars;
          window.setTimeout(() => options.events.onReady({ target: this }), 0);
        }

        getCurrentTime = () => 0;
        getDuration = () => 100;
        destroy = vi.fn();
        seekTo = vi.fn();
        playVideo = vi.fn();
        setPlaybackQuality = setPlaybackQuality;
      },
    };

    render(
      <MemoryRouter initialEntries={['/video/video-1']}>
        <Routes>
          <Route path="/video/:videoId" element={<VideoPlayer />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(setPlaybackQuality).toHaveBeenCalledWith('hd1080');
    });
    expect(playerVars?.vq).toBe('hd1080');
  });

  it('shows a direct YouTube fallback when the embedded player rejects playback', async () => {
    window.YT = {
      PlayerState: { ENDED: 0 },
      Player: class {
        constructor(_element: HTMLElement, options: any) {
          window.setTimeout(() => options.events.onError({ target: this, data: 150 }), 0);
        }

        getCurrentTime = () => 0;
        getDuration = () => 0;
        destroy = vi.fn();
        seekTo = vi.fn();
        playVideo = vi.fn();
      },
    };

    render(
      <MemoryRouter initialEntries={['/video/video-1']}>
        <Routes>
          <Route path="/video/:videoId" element={<VideoPlayer />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('This video needs YouTube')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('link', { name: 'Open in YouTube' })[0]).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=video-1'
    );
  });

  it('uses same-tab navigation for the YouTube fallback button', () => {
    render(
      <MemoryRouter initialEntries={['/video/video-1']}>
        <Routes>
          <Route path="/video/:videoId" element={<VideoPlayer />} />
        </Routes>
      </MemoryRouter>
    );

    const openButton = screen.getByRole('link', { name: 'Open in YouTube' });

    expect(openButton).not.toHaveAttribute('target', '_blank');
  });

  it('shows video context, timeline controls, and related channel videos', () => {
    render(
      <MemoryRouter initialEntries={['/video/video-1']}>
        <Routes>
          <Route path="/video/:videoId" element={<VideoPlayer />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Current video' })).toBeInTheDocument();
    expect(screen.getByText('Channel One')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Previous/i })).toHaveTextContent('Previous video');
    expect(screen.getByRole('button', { name: /Next/i })).toHaveTextContent('Next video');
    expect(screen.getByRole('heading', { name: 'More from Channel One' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Related video/i })).toBeInTheDocument();
  });

  it('toggles watched, queue, and favorite controls from the detail screen', () => {
    render(
      <MemoryRouter initialEntries={['/video/video-1']}>
        <Routes>
          <Route path="/video/:videoId" element={<VideoPlayer />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));
    expect(mockMarkAsWatched).toHaveBeenCalledWith('video-1');

    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));
    expect(mockToggleQueuedVideo).toHaveBeenCalledWith(currentVideo);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockToggleFavoriteVideo).toHaveBeenCalledWith(currentVideo);
  });
});
