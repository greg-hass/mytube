import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useRef, useState, useEffect } from 'react';
import { VideoCard } from './VideoCard';
import type { YouTubeVideo } from '../types/youtube';
import { getCurrentViewportSize, isCompactMobileViewport } from '../lib/mobile-viewport';

interface Props {
    videos: YouTubeVideo[];
    columns?: number; // Optional: specify max columns (default 4)
    scrollStorageKey?: string;
    channelThumbnails?: Map<string, string>;
}

const ROW_GAP = 24;
const MIN_CARD_WIDTH = 260;
const VIDEO_INFO_HEIGHT = 112;

export const VirtualizedVideoGrid = ({ videos, columns = 4, scrollStorageKey, channelThumbnails }: Props) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const [itemsPerRow, setItemsPerRow] = useState(columns);
    const [containerWidth, setContainerWidth] = useState(0);
    const [scrollMargin, setScrollMargin] = useState(0);
    const hasRestoredScrollRef = useRef(false);

    // Update items per row based on container width
    useEffect(() => {
        const updateItemsPerRow = () => {
            if (!parentRef.current) return;
            const width = parentRef.current.offsetWidth;

            // Calculate how many cards fit
            // width = (cards * minCardWidth) + ((cards - 1) * gap)
            // width + gap = cards * (minCardWidth + gap)
            // cards = (width + gap) / (minCardWidth + gap)

            const calculatedColumns = Math.floor((width + ROW_GAP) / (MIN_CARD_WIDTH + ROW_GAP));

            // Clamp between 1 and max columns
            const maxResponsiveColumns = isCompactMobileViewport(getCurrentViewportSize()) ? 1 : columns;
            const newItemsPerRow = Math.max(1, Math.min(calculatedColumns, maxResponsiveColumns));

            setItemsPerRow(newItemsPerRow);
            setContainerWidth(width);
            setScrollMargin(parentRef.current.offsetTop);
        };

        updateItemsPerRow();

        const observer = new ResizeObserver(updateItemsPerRow);
        if (parentRef.current) {
            observer.observe(parentRef.current);
        }

        return () => observer.disconnect();
    }, [columns]);

    const cardWidth = containerWidth > 0
        ? (containerWidth - ROW_GAP * (itemsPerRow - 1)) / itemsPerRow
        : MIN_CARD_WIDTH;
    const cardHeight = Math.ceil(cardWidth * 9 / 16 + VIDEO_INFO_HEIGHT);
    const rowHeight = cardHeight + ROW_GAP;

    const rowVirtualizer = useWindowVirtualizer({
        count: Math.ceil(videos.length / itemsPerRow),
        estimateSize: () => rowHeight,
        overscan: 5,
        scrollMargin,
    });

    useEffect(() => {
        if (!scrollStorageKey || hasRestoredScrollRef.current) return;
        if (videos.length === 0) return;

        const savedScrollTop = Number(sessionStorage.getItem(scrollStorageKey));
        if (!Number.isFinite(savedScrollTop) || savedScrollTop <= 0) return;

        hasRestoredScrollRef.current = true;
        window.scrollTo({ top: savedScrollTop });

        requestAnimationFrame(() => {
            window.scrollTo({ top: savedScrollTop });
        });
    }, [scrollStorageKey, videos.length, itemsPerRow]);

    useEffect(() => {
        if (!scrollStorageKey) return;

        const saveScrollPosition = () => {
            sessionStorage.setItem(scrollStorageKey, String(Math.round(window.scrollY)));
        };

        window.addEventListener('scroll', saveScrollPosition, { passive: true });
        window.addEventListener('pagehide', saveScrollPosition);

        return () => {
            window.removeEventListener('scroll', saveScrollPosition);
            window.removeEventListener('pagehide', saveScrollPosition);
        };
    }, [scrollStorageKey]);

    return (
        <div
            ref={parentRef}
            data-testid="latest-videos-timeline"
            data-row-height={rowHeight}
            className="overflow-visible"
        >
            <div
                style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                }}
            >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const startIndex = virtualRow.index * itemsPerRow;
                    const rowItems = videos.slice(startIndex, startIndex + itemsPerRow);

                    return (
                        <div
                            key={virtualRow.index}
                            data-index={virtualRow.index}
                            ref={rowVirtualizer.measureElement}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: `${rowHeight}px`,
                                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                            }}
                        >
                            <div
                                className="mobile-landscape-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                                style={{ height: `${cardHeight}px` }}
                            >
                                {rowItems.map((video, idx) => (
                                    <VideoCard
                                        key={video.id}
                                        video={video}
                                        index={startIndex + idx}
                                        channelThumbnail={channelThumbnails?.get(video.channelId)}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
