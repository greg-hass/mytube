import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Key, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '../store/useStore';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
    const { apiKey, setApiKey, useApiForVideos, toggleUseApiForVideos, quotaUsed, resetQuota } = useStore();
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
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50"
                    >
                        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden m-4">
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <Key className="w-5 h-5 text-red-600" />
                                    Settings
                                </h2>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                >
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        YouTube Data API Key
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="password"
                                            value={inputKey}
                                            onChange={(e) => setInputKey(e.target.value)}
                                            placeholder="AIzaSy..."
                                            className="w-full px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                                        />
                                    </div>
                                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                        Required for reliable thumbnail fetching and batch updates.
                                        <a
                                            href="https://console.cloud.google.com/apis/credentials"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-red-600 hover:underline ml-1"
                                        >
                                            Get a key here
                                        </a>
                                    </p>

                                    {apiKey && (
                                        <div className="mt-3">
                                            <button
                                                onClick={handleRefreshIcons}
                                                disabled={isRefreshingIcons || iconRefreshSuccess}
                                                className="text-xs flex items-center gap-1.5 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isRefreshingIcons ? (
                                                    <>
                                                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                        Refreshing icons...
                                                    </>
                                                ) : iconRefreshSuccess ? (
                                                    <>
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        Icons updated!
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center text-[8px]">↻</div>
                                                        Refresh Channel Icons
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-between">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Use API for Video Feeds
                                        </label>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            More reliable but uses ~1 quota unit per channel refresh.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            toggleUseApiForVideos();
                                            const newValue = !useApiForVideos;
                                            if (newValue) {
                                                toast.success('API video fetching enabled', {
                                                    description: 'Click Refresh on Latest Videos tab for faster sync',
                                                });
                                            } else {
                                                toast.info('API video fetching disabled', {
                                                    description: 'Using RSS feeds (slower but free)',
                                                });
                                            }
                                        }}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${useApiForVideos ? 'bg-red-600' : 'bg-gray-200 dark:bg-gray-700'
                                            }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useApiForVideos ? 'translate-x-6' : 'translate-x-1'
                                                }`}
                                        />
                                    </button>
                                </div>

                                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Estimated Quota Usage
                                        </span>
                                        <span className={`text-sm font-bold ${quotaUsed > 10000 ? 'text-red-600' : 'text-green-600'}`}>
                                            {quotaUsed.toLocaleString()} / 10,000
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-4">
                                        <div
                                            className={`h-2.5 rounded-full ${quotaUsed > 10000 ? 'bg-red-600' : 'bg-green-600'}`}
                                            style={{ width: `${Math.min((quotaUsed / 10000) * 100, 100)}%` }}
                                        ></div>
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            onClick={() => resetQuota()}
                                            className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 underline"
                                        >
                                            Reset Counter
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 flex gap-3">
                                    <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                    <div className="text-sm text-blue-800 dark:text-blue-200">
                                        <p className="font-medium mb-1">Why do I need this?</p>
                                        <p className="opacity-90">
                                            Without an API key, the app relies on web scraping which is slow and unreliable. Adding a key enables instant batch updates and high-quality thumbnails.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-6 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={!inputKey || isSaved}
                                    className={`flex items-center gap-2 px-6 py-2 rounded-lg text-white font-medium transition-all ${isSaved
                                        ? 'bg-green-600'
                                        : 'bg-red-600 hover:bg-red-700'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    {isSaved ? (
                                        <>
                                            <CheckCircle2 className="w-4 h-4" />
                                            Saved!
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4" />
                                            Save Changes
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
