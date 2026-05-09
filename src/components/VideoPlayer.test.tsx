import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoPlayer } from './VideoPlayer';

const mockMarkAsWatched = vi.hoisted(() => vi.fn());

vi.mock('../store/useStore', () => ({
  useStore: (selector?: (state: { markAsWatched: typeof mockMarkAsWatched }) => unknown) => {
    const state = { markAsWatched: mockMarkAsWatched };
    return selector ? selector(state) : state;
  },
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
  },
}));

describe('VideoPlayer', () => {
  beforeEach(() => {
    mockMarkAsWatched.mockClear();
    vi.stubGlobal('scrollTo', vi.fn());
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    });
    window.YT = undefined;
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
});
