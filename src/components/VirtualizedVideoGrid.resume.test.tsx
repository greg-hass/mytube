import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualizedVideoGrid } from './VirtualizedVideoGrid';
import type { YouTubeVideo } from '../types/youtube';

vi.mock('./VideoCard', () => ({
    VideoCard: ({ video }: { video: YouTubeVideo }) => <article>{video.title}</article>,
}));

const videos: YouTubeVideo[] = [
    {
        id: 'video-1',
        title: 'Resume test video',
        description: '',
        thumbnail: '',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: new Date(2026, 4, 1).toISOString(),
    },
];

describe('VirtualizedVideoGrid resume behavior', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
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
    });

    it('does not force a full virtualizer remeasure when the PWA resumes', () => {
        const windowAddEventListener = vi.spyOn(window, 'addEventListener');
        const documentAddEventListener = vi.spyOn(document, 'addEventListener');

        render(<VirtualizedVideoGrid videos={videos} columns={4} />);

        expect(windowAddEventListener).not.toHaveBeenCalledWith('pageshow', expect.any(Function));
        expect(documentAddEventListener).not.toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });
});
