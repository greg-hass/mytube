import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualizedVideoGrid } from './VirtualizedVideoGrid';
import type { YouTubeVideo } from '../types/youtube';

const mockStore = vi.hoisted(() => ({
    watchedVideos: new Set<string>(),
    markAsWatched: vi.fn(),
    markAsUnwatched: vi.fn(),
}));

vi.mock('../store/useStore', () => ({
    useStore: () => mockStore,
}));

vi.mock('../hooks/useFavoriteVideos', () => ({
    useFavoriteVideos: () => ({
        isFavoriteVideo: () => false,
        toggleFavoriteVideo: vi.fn(),
    }),
}));

vi.mock('../hooks/useQueuedVideos', () => ({
    useQueuedVideos: () => ({
        isQueuedVideo: () => false,
        toggleQueuedVideo: vi.fn(),
    }),
}));

const videos: YouTubeVideo[] = [
    {
        id: 'video-1',
        title: 'Playing video',
        description: '',
        thumbnail: 'https://i.ytimg.com/vi/video-1/hqdefault.jpg',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: '2026-05-23T10:00:00.000Z',
    },
    {
        id: 'video-2',
        title: 'Next video',
        description: '',
        thumbnail: 'https://i.ytimg.com/vi/video-2/hqdefault.jpg',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: '2026-05-23T09:00:00.000Z',
    },
];

describe('VirtualizedVideoGrid inline playback', () => {
    beforeEach(() => {
        mockStore.watchedVideos = new Set<string>();
        mockStore.markAsWatched.mockClear();
        mockStore.markAsUnwatched.mockClear();
        vi.unstubAllGlobals();
        vi.stubGlobal('scrollTo', vi.fn());

        const storage = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key: string) => storage.get(key) ?? null),
            setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
            removeItem: vi.fn((key: string) => storage.delete(key)),
            clear: vi.fn(() => storage.clear()),
        });

        class ResizeObserverMock {
            observe = vi.fn();
            unobserve = vi.fn();
            disconnect = vi.fn();
        }

        vi.stubGlobal('ResizeObserver', ResizeObserverMock);
        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
            configurable: true,
            value: 320,
        });
    });

    it('keeps an inline player alive when refreshed feed data rerenders the grid', async () => {
        const destroy = vi.fn();
        const playerConstructor = vi.fn();
        const player = {
            getCurrentTime: () => 10,
            getDuration: () => 120,
            destroy,
            seekTo: vi.fn(),
            playVideo: vi.fn(),
        };
        window.YT = {
            PlayerState: { ENDED: 0 },
            Player: class {
                constructor(element: HTMLElement, options: any) {
                    playerConstructor(element, options);
                    window.setTimeout(() => options.events.onReady({ target: player }), 0);
                    return player;
                }
            },
        } as any;

        const { rerender } = render(
            <MemoryRouter>
                <VirtualizedVideoGrid videos={videos} columns={4} />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', { name: 'Play Playing video inline' }));

        await waitFor(() => {
            expect(playerConstructor).toHaveBeenCalledTimes(1);
        });

        rerender(
            <MemoryRouter>
                <VirtualizedVideoGrid
                    videos={[
                        { ...videos[0], title: 'Playing video refreshed' },
                        videos[1],
                    ]}
                    columns={4}
                />
            </MemoryRouter>
        );

        expect(playerConstructor).toHaveBeenCalledTimes(1);
        expect(destroy).not.toHaveBeenCalled();
        expect(screen.getByTestId('inline-video-player')).toBeInTheDocument();
    });
});
