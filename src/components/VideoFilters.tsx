import { motion } from 'framer-motion';
import { Filter, Calendar, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store/useStore';
import type { YouTubeChannel } from '../types/youtube';

interface VideoFiltersProps {
    channels: YouTubeChannel[];
}

export const VideoFilters = ({ channels }: VideoFiltersProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const {
        dateRangeStart,
        dateRangeEnd,
        selectedChannelIds,
        showWatchedOnly,
        setDateRange,
        setSelectedChannels,
        toggleShowWatchedOnly,
        clearFilters,
    } = useStore();

    const hasActiveFilters = dateRangeStart || dateRangeEnd || selectedChannelIds.length > 0 || showWatchedOnly;

    const handleChannelToggle = (channelId: string) => {
        if (selectedChannelIds.includes(channelId)) {
            setSelectedChannels(selectedChannelIds.filter(id => id !== channelId));
        } else {
            setSelectedChannels([...selectedChannelIds, channelId]);
        }
    };

    return (
        <div className="relative">
            {/* Filter Button */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${hasActiveFilters
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
            >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
                {hasActiveFilters && (
                    <span className="bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                        {selectedChannelIds.length || '•'}
                    </span>
                )}
            </motion.button>

            {/* Filter Panel */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Panel */}
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute right-0 top-12 w-80 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 z-50 overflow-hidden"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900 dark:text-white">Filters</h3>
                            {hasActiveFilters && (
                                <button
                                    onClick={clearFilters}
                                    className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                >
                                    Clear all
                                </button>
                            )}
                        </div>

                        {/* Content */}
                        <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                            {/* Date Range */}
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    <Calendar className="w-4 h-4" />
                                    Date Range
                                </label>
                                <div className="space-y-2">
                                    <input
                                        type="date"
                                        value={dateRangeStart || ''}
                                        onChange={(e) => setDateRange(e.target.value || null, dateRangeEnd)}
                                        className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm"
                                        placeholder="Start date"
                                    />
                                    <input
                                        type="date"
                                        value={dateRangeEnd || ''}
                                        onChange={(e) => setDateRange(dateRangeStart, e.target.value || null)}
                                        className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm"
                                        placeholder="End date"
                                    />
                                </div>
                            </div>

                            {/* Watched Filter */}
                            <div>
                                <button
                                    onClick={toggleShowWatchedOnly}
                                    className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${showWatchedOnly
                                        ? 'bg-red-50 dark:bg-red-900/20 border-2 border-red-500'
                                        : 'bg-gray-50 dark:bg-gray-800 border-2 border-transparent'
                                        }`}
                                >
                                    <span className="flex items-center gap-2 text-sm font-medium">
                                        {showWatchedOnly ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                        {showWatchedOnly ? 'Watched only' : 'All videos'}
                                    </span>
                                </button>
                            </div>

                            {/* Channel Selection */}
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                                    Channels ({selectedChannelIds.length} selected)
                                </label>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {channels.map((channel) => (
                                        <label
                                            key={channel.id}
                                            className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedChannelIds.includes(channel.id)}
                                                onChange={() => handleChannelToggle(channel.id)}
                                                className="rounded border-gray-300 dark:border-gray-600"
                                            />
                                            <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                                                {channel.title}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </div>
    );
};
