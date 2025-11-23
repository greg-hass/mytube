import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Key, Save, CheckCircle2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
    const { apiKey, setApiKey, useApiForVideos, toggleUseApiForVideos, quotaUsed } = useStore();
    const { refreshAllChannels } = useSubscriptionStorage();
    const [inputKey, setInputKey] = useState(apiKey);
    const [isSaved, setIsSaved] = useState(false);
    const [isRefreshingIcons, setIsRefreshingIcons] = useState(false);
    const [iconRefreshSuccess, setIconRefreshSuccess] = useState(false);

    const handleRefreshIcons = async () => {
        setIsRefreshingIcons(true);
        try {
            await refreshAllChannels();
            setIconRefreshSuccess(true);
            setTimeout(() => setIconRefreshSuccess(false), 2000);
        } catch (error) {
            console.error('Failed to refresh icons:', error);
        } finally {
            setIsRefreshingIcons(false);
        }
    };

    const handleSave = () => {
        setApiKey(inputKey);
        setIsSaved(true);
        setTimeout(() => {
            setIsSaved(false);
            onClose();
        }, 1000);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-0 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl bg-white dark:bg-gray-900 md:rounded-2xl shadow-2xl z-50 flex flex-col max-h-[100dvh] md:max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
                            <h2 className="text-xl md:text-2xl font-bold">Settings</h2>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content - Scrollable */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                            {/* API Key Section */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <Key className="w-5 h-5 text-red-600" />
                                    <h3 className="text-lg font-semibold">YouTube API Key</h3>
                                </div>

                                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 md:p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <p className="text-xs md:text-sm text-blue-800 dark:text-blue-200 break-words">
                                        💡 Adding an API key enables faster video fetching and higher quality channel icons.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-sm font-medium">API Key</label>
                                    <input
                                        type="password"
                                        value={inputKey}
                                        onChange={(e) => setInputKey(e.target.value)}
                                        placeholder="Enter your YouTube Data API v3 key"
                                        className="w-full px-3 md:px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border-2 border-transparent focus:border-red-500 focus:bg-white dark:focus:bg-gray-900 transition-all outline-none text-sm md:text-base"
                                    />
                                    <p className="text-xs text-gray-500 dark:text-gray-400 break-words">
                                        Get your API key from{' '}
                                        <a
                                            href="https://console.cloud.google.com/apis/credentials"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-red-600 hover:underline break-all"
                                        >
                                            Google Cloud Console
                                        </a>
                                    </p>
                                </div>

                                <button
                                    onClick={handleSave}
                                    disabled={isSaved}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-green-600 text-white transition-colors text-sm md:text-base"
                                >
                                    {isSaved ? (
                                        <>
                                            <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" />
                                            <span>Saved!</span>
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4 md:w-5 md:h-5" />
                                            <span>Save API Key</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* API Features Section */}
                            {apiKey && (
                                <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                                    <h3 className="text-lg font-semibold">API Features</h3>

                                    {/* Use API for Videos Toggle */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 md:p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm md:text-base">Use API for Video Fetching</p>
                                            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 break-words">
                                                Faster and more reliable, but uses quota
                                            </p>
                                        </div>
                                        <button
                                            onClick={toggleUseApiForVideos}
                                            className={`flex-shrink-0 relative w-12 h-6 md:w-14 md:h-7 rounded-full transition-colors ${useApiForVideos
                                                ? 'bg-red-600'
                                                : 'bg-gray-300 dark:bg-gray-600'
                                                }`}
                                        >
                                            <motion.div
                                                className="absolute top-0.5 left-0.5 w-5 h-5 md:w-6 md:h-6 bg-white rounded-full shadow-md"
                                                animate={{ x: useApiForVideos ? 24 : 0 }}
                                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                            />
                                        </button>
                                    </div>

                                    {/* Quota Display */}
                                    <div className="p-3 md:p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                                            <span className="text-sm font-medium">Daily Quota Used</span>
                                            <span className="text-lg md:text-xl font-bold text-red-600">
                                                {quotaUsed.toLocaleString()} / 10,000
                                            </span>
                                        </div>
                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                            <div
                                                className="bg-red-600 h-2 rounded-full transition-all"
                                                style={{ width: `${Math.min((quotaUsed / 10000) * 100, 100)}%` }}
                                            />
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 break-words">
                                            Resets daily at midnight PT
                                        </p>
                                    </div>

                                    {/* Refresh Icons Button */}
                                    <button
                                        onClick={handleRefreshIcons}
                                        disabled={isRefreshingIcons || iconRefreshSuccess}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:bg-green-600 disabled:text-white transition-colors text-sm md:text-base"
                                    >
                                        {iconRefreshSuccess ? (
                                            <>
                                                <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" />
                                                <span>Refreshed!</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="break-words">
                                                    {isRefreshingIcons ? 'Refreshing...' : 'Refresh All Channel Icons'}
                                                </span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
