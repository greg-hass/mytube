import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Key, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useStore } from '../store/useStore';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
    const { apiKey, setApiKey } = useStore();
    const [inputKey, setInputKey] = useState(apiKey);
    const [isSaved, setIsSaved] = useState(false);

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
                                            Optional. Videos and thumbnails use RSS; the key is only used as a capped fallback for resolving channel handles.
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
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
