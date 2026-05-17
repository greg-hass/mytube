import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualizedVideoGrid } from './VirtualizedVideoGrid';
import type { YouTubeVideo } from '../types/youtube';

vi.mock('./VideoCard', () => ({
    VideoCard: ({ video, onUnavailable }: { video: YouTubeVideo; onUnavailable?: (videoId: string) => void }) => (
        <article>
            {video.title}
            <button type="button" onClick={() => onUnavailable?.(video.id)}>hide {video.title}</button>
        </article>
    ),
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

    it('uses the measured virtualizer column count for the rendered grid', async () => {
        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
            configurable: true,
            value: 860,
        });

        render(<VirtualizedVideoGrid videos={videos} columns={4} />);

        const timeline = screen.getByTestId('latest-videos-timeline');

        await waitFor(() => {
            expect(timeline.querySelector('[data-index]')).toBeTruthy();
        });

        const grid = timeline.querySelector('.grid') as HTMLElement;

        expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' });
        expect(grid.className).not.toContain('sm:grid-cols-2');
        expect(grid.className).not.toContain('lg:grid-cols-3');
    });

    it('keeps landscape phone timelines to one column even when the viewport is wider than sm', async () => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: 932,
        });
        Object.defineProperty(window, 'innerHeight', {
            configurable: true,
            value: 430,
        });
        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
            configurable: true,
            value: 860,
        });

        render(<VirtualizedVideoGrid videos={videos} columns={4} />);

        const timeline = screen.getByTestId('latest-videos-timeline');

        await waitFor(() => {
            expect(timeline.querySelector('[data-index]')).toBeTruthy();
        });

        const firstRow = timeline.querySelector('[data-index]') as HTMLElement;

        expect(firstRow.querySelectorAll('article')).toHaveLength(1);
        expect(firstRow.querySelector('.grid')).toHaveStyle({ gridTemplateColumns: 'repeat(1, minmax(0, 1fr))' });
    });

    it('removes unavailable videos from the virtualized list so the timeline closes the gap', async () => {
        render(<VirtualizedVideoGrid videos={videos.slice(0, 3)} columns={4} />);

        expect(screen.getByText('Video 0')).toBeInTheDocument();
        expect(screen.getByText('Video 1')).toBeInTheDocument();
        expect(screen.getByText('Video 2')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'hide Video 1' }));

        expect(screen.queryByText('Video 1')).not.toBeInTheDocument();
        expect(screen.getByText('Video 0')).toBeInTheDocument();
        expect(screen.getByText('Video 2')).toBeInTheDocument();
    });
});
