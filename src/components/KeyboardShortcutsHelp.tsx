import { motion, AnimatePresence } from 'framer-motion';
import { X, Command, Keyboard } from 'lucide-react';

interface KeyboardShortcutsHelpProps {
    isOpen: boolean;
    onClose: () => void;
}

export const KeyboardShortcutsHelp = ({ isOpen, onClose }: KeyboardShortcutsHelpProps) => {
    const shortcuts = [
        { keys: ['Ctrl', 'K'], description: 'Focus search bar' },
        { keys: ['Ctrl', 'N'], description: 'Add new channel' },
        { keys: ['Esc'], description: 'Close any modal' },
        { keys: ['?'], description: 'Show this help' },
    ];

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifierKey = isMac ? '⌘' : 'Ctrl';

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
                                    <Keyboard className="w-5 h-5 text-red-600" />
                                    Keyboard Shortcuts
                                </h2>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                >
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 space-y-3">
                                {shortcuts.map((shortcut, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                                    >
                                        <span className="text-sm text-gray-700 dark:text-gray-300">
                                            {shortcut.description}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            {shortcut.keys.map((key, i) => (
                                                <span key={i} className="flex items-center gap-1">
                                                    <kbd className="px-2 py-1 text-xs font-semibold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded shadow-sm">
                                                        {key === 'Ctrl' ? modifierKey : key}
                                                    </kbd>
                                                    {i < shortcut.keys.length - 1 && (
                                                        <span className="text-gray-400">+</span>
                                                    )}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Footer */}
                            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
                                <p className="text-xs text-gray-500 dark:text-gray-400 text-center flex items-center justify-center gap-1">
                                    <Command className="w-3 h-3" />
                                    Shortcuts work from anywhere in the app
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
