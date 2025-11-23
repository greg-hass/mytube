import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useState, useEffect } from 'react';
import { VideoCard } from './VideoCard';
import type { YouTubeVideo } from '../types/youtube';

interface Props {
    videos: YouTubeVideo[];
    columns?: number; // Optional: specify max columns (default 4)
}

export const VirtualizedVideoGrid = ({ videos, columns = 4 }: Props) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const [itemsPerRow, setItemsPerRow] = useState(columns);

    // Update items per row based on container width
    useEffect(() => {
        const updateItemsPerRow = () => {
            if (!parentRef.current) return;
            const width = parentRef.current.offsetWidth;

            // Dynamic column calculation based on minimum card width (e.g., 260px)
            // This is more robust than hardcoded breakpoints
            const minCardWidth = 260;
            const gap = 24; // gap-6 is 1.5rem = 24px

            // Calculate how many cards fit
            // width = (cards * minCardWidth) + ((cards - 1) * gap)
            // width + gap = cards * (minCardWidth + gap)
            // cards = (width + gap) / (minCardWidth + gap)

            const calculatedColumns = Math.floor((width + gap) / (minCardWidth + gap));

            // Clamp between 1 and max columns
            const newItemsPerRow = Math.max(1, Math.min(calculatedColumns, columns));

            setItemsPerRow(newItemsPerRow);
        };

        updateItemsPerRow();

        const observer = new ResizeObserver(updateItemsPerRow);
        if (parentRef.current) {
            observer.observe(parentRef.current);
        }

        return () => observer.disconnect();
    }, [columns]);

    const rowVirtualizer = useVirtualizer({
        count: Math.ceil(videos.length / itemsPerRow),
        getScrollElement: () => parentRef.current,
        estimateSize: () => 320, // Estimated height of video card
        overscan: 5,
    });

    return (
        <div
            ref={parentRef}
            className="h-[calc(100vh-300px)] overflow-auto"
            style={{ contain: 'strict' }}
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
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
                                {rowItems.map((video, idx) => (
                                    <VideoCard
                                        key={video.id}
                                        video={video}
                                        index={startIndex + idx}
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
