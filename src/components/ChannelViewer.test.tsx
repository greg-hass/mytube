import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelViewer } from './ChannelViewer';

let mockVideos = [
  {
    id: 'video-1',
    title: 'Channel upload',
    description: '',
    thumbnail: 'https://example.com/video.jpg',
    channelId: 'UC123',
    channelTitle: 'Test Channel',
    publishedAt: new Date().toISOString(),
  },
];

let mockWatchedVideos = new Set<string>();
const mockMarkAsWatched = vi.fn();

vi.mock('./Header', () => ({
  Header: () => <header>Header</header>,
}));

vi.mock('../hooks/useRSSVideos', () => ({
  useRSSVideos: () => ({
    videos: mockVideos,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('../hooks/useSubscriptionStorage', () => ({
  useSubscriptionStorage: () => ({
    allSubscriptions: [
      {
        id: 'UC123',
        title: 'Test Channel',
        description: '',
        thumbnail: 'https://example.com/channel.jpg',
      },
    ],
    count: 1,
  }),
}));

vi.mock('../store/useStore', () => ({
  useStore: () => ({
    watchedVideos: mockWatchedVideos,
    markAsWatched: mockMarkAsWatched,
    markAsUnwatched: vi.fn(),
  }),
}));

describe('ChannelViewer', () => {
  beforeEach(() => {
    mockWatchedVideos = new Set<string>();
    mockMarkAsWatched.mockClear();

    mockVideos = [
      {
        id: 'video-1',
        title: 'Channel upload',
        description: '',
        thumbnail: 'https://example.com/video.jpg',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: new Date().toISOString(),
      },
    ];

    class ResizeObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    vi.stubGlobal('scrollTo', vi.fn());

    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      value: 390,
    });
  });

  it('uses the same timeline surface as Latest for channel videos', () => {
    render(
      <MemoryRouter initialEntries={['/channel/UC123']}>
        <Routes>
          <Route path="/channel/:channelId" element={<ChannelViewer />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('latest-videos-timeline')).toBeInTheDocument();
    expect(screen.queryByText('Latest Videos')).not.toBeInTheDocument();
    expect(screen.getByText('Channel upload')).toBeInTheDocument();
  });

  it('opens a channel at the top of its timeline', () => {
    render(
      <MemoryRouter initialEntries={['/channel/UC123']}>
        <Routes>
          <Route path="/channel/:channelId" element={<ChannelViewer />} />
        </Routes>
      </MemoryRouter>
    );

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('shows the latest channel video first', () => {
    mockVideos = [
      {
        id: 'video-old',
        title: 'Older channel upload',
        description: '',
        thumbnail: 'https://example.com/old.jpg',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: '2026-05-01T10:00:00.000Z',
      },
      {
        id: 'video-new',
        title: 'Newest channel upload',
        description: '',
        thumbnail: 'https://example.com/new.jpg',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: '2026-05-07T10:00:00.000Z',
      },
    ];

    render(
      <MemoryRouter initialEntries={['/channel/UC123']}>
        <Routes>
          <Route path="/channel/:channelId" element={<ChannelViewer />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Newest channel upload').compareDocumentPosition(screen.getByText('Older channel upload')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('can hide watched videos from a channel timeline', () => {
    mockWatchedVideos = new Set(['video-1']);
    mockVideos = [
      {
        id: 'video-1',
        title: 'Already watched channel upload',
        description: '',
        thumbnail: 'https://example.com/watched.jpg',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: '2026-05-07T10:00:00.000Z',
      },
      {
        id: 'video-2',
        title: 'Fresh channel upload',
        description: '',
        thumbnail: 'https://example.com/fresh.jpg',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: '2026-05-07T11:00:00.000Z',
      },
    ];

    render(
      <MemoryRouter initialEntries={['/channel/UC123']}>
        <Routes>
          <Route path="/channel/:channelId" element={<ChannelViewer />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Already watched channel upload')).toBeInTheDocument();
    expect(screen.getByText('Fresh channel upload')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Hide watched'));

    expect(screen.queryByText('Already watched channel upload')).not.toBeInTheDocument();
    expect(screen.getByText('Fresh channel upload')).toBeInTheDocument();
  });

  it('marks every unwatched channel video watched from the channel toolbar', () => {
    mockWatchedVideos = new Set(['video-1']);
    mockVideos = [
      {
        id: 'video-1',
        title: 'Already watched channel upload',
        description: '',
        thumbnail: 'https://example.com/watched.jpg',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: '2026-05-07T10:00:00.000Z',
      },
      {
        id: 'video-2',
        title: 'Fresh channel upload',
        description: '',
        thumbnail: 'https://example.com/fresh.jpg',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: '2026-05-07T11:00:00.000Z',
      },
    ];

    render(
      <MemoryRouter initialEntries={['/channel/UC123']}>
        <Routes>
          <Route path="/channel/:channelId" element={<ChannelViewer />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mark channel watched' }));

    expect(mockMarkAsWatched).toHaveBeenCalledTimes(1);
    expect(mockMarkAsWatched).toHaveBeenCalledWith('video-2');
  });
});
