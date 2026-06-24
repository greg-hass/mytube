import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { VideoCard } from './VideoCard';
import type { YouTubeVideo } from '../types/youtube';
import { getCurrentViewportSize, isCompactMobileViewport } from '../lib/mobile-viewport';

interface Props {
    videos: YouTubeVideo[];
    columns?: number; // Optional: specify max columns (default 4)
    scrollStorageKey?: string;
    channelThumbnails?: Map<string, string>;
    context?: 'latest' | 'queue';
}

const ROW_GAP = 24;
const MIN_CARD_WIDTH = 260;
const VIDEO_INFO_HEIGHT = 112;

const getItemsPerRow = (width: number, columns: number) => {
    const calculatedColumns = Math.floor((width + ROW_GAP) / (MIN_CARD_WIDTH + ROW_GAP));
    const maxResponsiveColumns = isCompactMobileViewport(getCurrentViewportSize()) ? 1 : columns;

    return Math.max(1, Math.min(calculatedColumns, maxResponsiveColumns));
};

const getInitialContainerWidth = () => {
    if (typeof window === 'undefined') return MIN_CARD_WIDTH;
    return Math.max(MIN_CARD_WIDTH, Math.min(window.innerWidth, 1280) - 32);
};

export const VirtualizedVideoGrid = ({ videos, columns = 4, scrollStorageKey, channelThumbnails, context = 'latest' }: Props) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const [inlinePlaybackVideos, setInlinePlaybackVideos] = useState<YouTubeVideo[] | null>(null);
    const [inlinePlaybackVideoId, setInlinePlaybackVideoId] = useState<string | null>(null);
    const latestVideosRef = useRef(videos);
    const inlinePlaybackVideoIdRef = useRef<string | null>(null);
    const [containerWidth, setContainerWidth] = useState(() => getInitialContainerWidth());
    const [itemsPerRow, setItemsPerRow] = useState(() => getItemsPerRow(getInitialContainerWidth(), columns));
    const [scrollMargin, setScrollMargin] = useState(0);
    const [unavailableVideoIds, setUnavailableVideoIds] = useState<Set<string>>(() => new Set());
    const hasRestoredScrollRef = useRef(false);

    const displayedVideos = inlinePlaybackVideos || videos;

    useEffect(() => {
        latestVideosRef.current = videos;
    }, [videos]);

    useEffect(() => {
        inlinePlaybackVideoIdRef.current = inlinePlaybackVideoId;
    }, [inlinePlaybackVideoId]);

    const visibleVideos = useMemo(() => {
        if (unavailableVideoIds.size === 0) return displayedVideos;
        return displayedVideos.filter((video) => !unavailableVideoIds.has(video.id));
    }, [displayedVideos, unavailableVideoIds]);

    const handleInlinePlaybackChange = useCallback((videoId: string, isPlaying: boolean) => {
        setInlinePlaybackVideos((currentVideos) => {
            if (isPlaying) return currentVideos || latestVideosRef.current;
            return inlinePlaybackVideoIdRef.current === videoId ? null : currentVideos;
        });
        setInlinePlaybackVideoId((currentVideoId) => {
            if (isPlaying) return videoId;
            return currentVideoId === videoId ? null : currentVideoId;
        });
    }, []);

    const handleVideoUnavailable = (videoId: string) => {
        setUnavailableVideoIds((currentIds) => {
            if (currentIds.has(videoId)) return currentIds;

            const nextIds = new Set(currentIds);
            nextIds.add(videoId);
            return nextIds;
        });
    };

    // Update items per row based on container width
    useEffect(() => {
        const updateItemsPerRow = () => {
            if (!parentRef.current) return;
            const width = parentRef.current.offsetWidth;

            // Calculate how many cards fit
            // width = (cards * minCardWidth) + ((cards - 1) * gap)
            // width + gap = cards * (minCardWidth + gap)
            // cards = (width + gap) / (minCardWidth + gap)

            const newItemsPerRow = getItemsPerRow(width, columns);

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
        count: Math.ceil(visibleVideos.length / itemsPerRow),
        estimateSize: () => rowHeight,
        overscan: 5,
        scrollMargin,
    });

    useEffect(() => {
        if (!scrollStorageKey || hasRestoredScrollRef.current) return;
        if (visibleVideos.length === 0) return;

        const savedScrollTop = Number(sessionStorage.getItem(scrollStorageKey));
        if (!Number.isFinite(savedScrollTop) || savedScrollTop <= 0) return;

        hasRestoredScrollRef.current = true;
        window.scrollTo({ top: savedScrollTop });

        requestAnimationFrame(() => {
            window.scrollTo({ top: savedScrollTop });
        });
    }, [scrollStorageKey, visibleVideos.length, itemsPerRow]);

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
                    const rowItems = visibleVideos.slice(startIndex, startIndex + itemsPerRow);

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
                                className="grid gap-6"
                                style={{
                                    height: `${cardHeight}px`,
                                    gridTemplateColumns: `repeat(${itemsPerRow}, minmax(0, 1fr))`,
                                }}
                            >
                                {rowItems.map((video, idx) => (
                                    <VideoCard
                                        key={video.id}
                                        video={video}
                                        index={startIndex + idx}
                                        channelThumbnail={channelThumbnails?.get(video.channelId)}
                                        onInlinePlaybackChange={handleInlinePlaybackChange}
                                        onUnavailable={handleVideoUnavailable}
                                        context={context}
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
