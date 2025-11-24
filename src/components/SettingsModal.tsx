import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Key, CheckCircle2, RefreshCw, Zap, ShieldCheck } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
    const { apiKey, setApiKey, useApiForVideos, toggleUseApiForVideos } = useStore();
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
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-0 z-[100] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-xl bg-white dark:bg-gray-900 md:rounded-2xl shadow-2xl flex flex-col h-[100dvh] md:h-auto md:max-h-[85vh] overflow-hidden border border-gray-200 dark:border-gray-800"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
                            <h2 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                                Settings
                            </h2>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-8 custom-scrollbar">

                            {/* API Configuration Section */}
                            <section className="space-y-4">
                                <div className="flex items-center gap-2 text-red-600 mb-2">
                                    <Key className="w-5 h-5" />
                                    <h3 className="font-semibold text-gray-900 dark:text-white">API Configuration</h3>
                                </div>

                                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-100 dark:border-gray-800 space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            YouTube Data API Key
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="password"
                                                value={inputKey}
                                                onChange={(e) => setInputKey(e.target.value)}
                                                placeholder="Enter your API key..."
                                                className="w-full pl-4 pr-10 py-2.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all outline-none text-sm"
                                            />
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                                                {isSaved ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <ShieldCheck className="w-4 h-4" />}
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Required for fetching high-quality metadata and faster updates.
                                            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline ml-1">
                                                Get a key
                                            </a>
                                        </p>
                                    </div>

                                    <button
                                        onClick={handleSave}
                                        disabled={isSaved || !inputKey}
                                        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${isSaved
                                            ? 'bg-green-500 text-white'
                                            : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90'
                                            }`}
                                    >
                                        {isSaved ? 'Saved Successfully' : 'Save Changes'}
                                    </button>
                                </div>
                            </section>

                            {/* Features Section */}
                            {apiKey && (
                                <section className="space-y-4">
                                    <div className="flex items-center gap-2 text-blue-600 mb-2">
                                        <Zap className="w-5 h-5" />
                                        <h3 className="font-semibold text-gray-900 dark:text-white">Performance & Features</h3>
                                    </div>

                                    <div className="grid gap-4">
                                        {/* API Toggle */}
                                        <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                                            <div className="space-y-1">
                                                <p className="font-medium text-gray-900 dark:text-white">Enhanced Fetching</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">Use API for faster, reliable updates</p>
                                            </div>
                                            <button
                                                onClick={toggleUseApiForVideos}
                                                className={`relative w-12 h-6 rounded-full transition-colors ${useApiForVideos ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                                                    }`}
                                            >
                                                <motion.div
                                                    className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm"
                                                    animate={{ x: useApiForVideos ? 24 : 0 }}
                                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                />
                                            </button>
                                        </div>



                                        {/* Maintenance */}
                                        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="space-y-1">
                                                    <p className="font-medium text-gray-900 dark:text-white">Refresh Metadata</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">Update channel icons and names</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={handleRefreshIcons}
                                                disabled={isRefreshingIcons || iconRefreshSuccess}
                                                className="w-full py-2 px-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors flex items-center justify-center gap-2"
                                            >
                                                {isRefreshingIcons ? (
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                ) : iconRefreshSuccess ? (
                                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                                ) : (
                                                    <RefreshCw className="w-4 h-4" />
                                                )}
                                                {isRefreshingIcons ? 'Refreshing...' : iconRefreshSuccess ? 'Done!' : 'Refresh Icons'}
                                            </button>
                                        </div>
                                    </div>
                                </section>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
