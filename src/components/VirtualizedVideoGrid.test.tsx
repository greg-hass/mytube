import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualizedVideoGrid } from './VirtualizedVideoGrid';
import type { YouTubeVideo } from '../types/youtube';

vi.mock('./VideoCard', () => ({
    VideoCard: ({ video }: { video: YouTubeVideo }) => <article>{video.title}</article>,
}));

const videos: YouTubeVideo[] = Array.from({ length: 20 }, (_, index) => ({
    id: `video-${index}`,
    title: `Video ${index}`,
    description: '',
    thumbnail: '',
    channelId: 'UC123',
    channelTitle: 'Test Channel',
    publishedAt: new Date(2026, 4, index + 1).toISOString(),
}));

describe('VirtualizedVideoGrid', () => {
    beforeEach(() => {
        sessionStorage.clear();
        vi.unstubAllGlobals();

        Object.defineProperty(window, 'scrollY', {
            configurable: true,
            value: 0,
        });
        vi.stubGlobal('scrollTo', vi.fn());

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

        HTMLElement.prototype.scrollTo = function scrollTo(options?: ScrollToOptions | number) {
            this.scrollTop = typeof options === 'number' ? options : options?.top || 0;
        };
    });

    it('uses page scrolling and restores the timeline scroll position for a persisted key', async () => {
        const scrollTo = vi.fn((options?: ScrollToOptions) => {
            Object.defineProperty(window, 'scrollY', {
                configurable: true,
                value: options?.top || 0,
            });
        });
        vi.stubGlobal('scrollTo', scrollTo);

        const { unmount } = render(
            <VirtualizedVideoGrid videos={videos} columns={4} scrollStorageKey="latest-scroll" />
        );

        const timeline = screen.getByTestId('latest-videos-timeline');
        expect(timeline.className).not.toContain('overflow-auto');
        expect(timeline.className).not.toContain('h-[calc');

        Object.defineProperty(window, 'scrollY', {
            configurable: true,
            value: 640,
        });
        fireEvent.scroll(window);

        expect(sessionStorage.getItem('latest-scroll')).toBe('640');

        unmount();

        render(<VirtualizedVideoGrid videos={videos} columns={4} scrollStorageKey="latest-scroll" />);

        await waitFor(() => {
            expect(scrollTo).toHaveBeenCalledWith({ top: 640 });
        });
    });

    it('uses a fixed virtual row height so timeline gaps stay consistent', async () => {
        render(<VirtualizedVideoGrid videos={videos} columns={4} />);

        const timeline = screen.getByTestId('latest-videos-timeline');
        const rowHeight = Number(timeline.dataset.rowHeight);

        expect(rowHeight).toBeGreaterThan(0);

        await waitFor(() => {
            expect(timeline.querySelector('[data-index]')).toBeTruthy();
        });

        const row = timeline.querySelector('[data-index]') as HTMLElement;
        expect(row.style.height).toBe(`${rowHeight}px`);
        expect(row.querySelector('.grid')).toHaveStyle({ height: `${rowHeight - 24}px` });
    });
});
