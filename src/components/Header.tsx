import { motion } from 'framer-motion';
import {
  Youtube,
  Sun,
  Moon,
  Search,
  Grid3x3,
  List,
  Download,
  Plus,
  Settings,
} from 'lucide-react';
import { useState } from 'react';
import { OPMLUpload } from './OPMLUpload';
import { SettingsModal } from './SettingsModal';
import { useStore } from '../store/useStore';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';
import type { SortBy } from '../types/youtube';

interface HeaderProps {
  onAddChannel?: () => void;
}

export const Header = ({ onAddChannel }: HeaderProps) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const {
    theme,
    toggleTheme,
    viewMode,
    setViewMode,
    sortBy,
    setSortBy,
    searchQuery,
    setSearchQuery,
    quotaUsed,
  } = useStore();
  const { count, exportOPML, exportJSON } = useSubscriptionStorage();
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleExport = (format: 'opml' | 'json') => {
    try {
      if (format === 'opml') {
        exportOPML();
      } else {
        exportJSON();
      }
      setShowExportMenu(false);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export subscriptions. Make sure you have subscriptions loaded.');
    }
  };

  // Calculate quota warning level
  const quotaPercentage = (quotaUsed / 10000) * 100;
  const showQuotaWarning = quotaPercentage >= 80;

  const getQuotaColor = () => {
    if (quotaPercentage >= 95) return 'bg-red-500 text-white';
    if (quotaPercentage >= 90) return 'bg-orange-500 text-white';
    return 'bg-yellow-500 text-white';
  };

  const getQuotaTooltip = () => {
    const remaining = 10000 - quotaUsed;
    return `${quotaUsed.toLocaleString()} / 10,000 units used (${remaining.toLocaleString()} remaining)\nResets daily at midnight PT`;
  };

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="sticky top-0 z-50 glass border-b border-gray-200 dark:border-gray-800 shadow-sm"
    >
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Logo */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-600 to-red-500 flex items-center justify-center shadow-lg">
              <Youtube className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="hidden md:block text-xl font-bold bg-gradient-to-r from-red-600 to-red-500 bg-clip-text text-transparent">
                Subscriptions
              </h1>
              <p className="hidden md:block text-xs text-gray-500 dark:text-gray-400">
                {count} channels
              </p>
            </div>
          </motion.div>

          {/* Search (Desktop) */}
          <div className="hidden md:block flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search channels..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-transparent focus:border-red-500 focus:bg-white dark:focus:bg-gray-900 transition-all outline-none"
              />
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Add Channel Button */}
            {onAddChannel && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onAddChannel}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Channel</span>
              </motion.button>
            )}

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="hidden sm:block px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border-2 border-transparent focus:border-red-500 transition-all outline-none cursor-pointer"
            >
              <option value="name">A-Z</option>
              <option value="recent">Recent</option>
              <option value="oldest">Oldest</option>
            </select>

            {/* View Mode */}
            <div className="hidden sm:flex items-center gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-800">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded ${viewMode === 'grid'
                  ? 'bg-white dark:bg-gray-900 shadow'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                  } transition-all`}
              >
                <Grid3x3 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${viewMode === 'list'
                  ? 'bg-white dark:bg-gray-900 shadow'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                  } transition-all`}
              >
                <List className="w-5 h-5" />
              </button>
            </div>

            {/* Import OPML */}
            <OPMLUpload minimal />

            {/* Export OPML/JSON */}
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </motion.button>

              {showExportMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowExportMenu(false)}
                  />
                  <div className="absolute right-0 top-12 w-40 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 z-50 overflow-hidden">
                    <button
                      onClick={() => handleExport('opml')}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      OPML
                    </button>
                    <button
                      onClick={() => handleExport('json')}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      JSON
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Quota Warning */}
            {showQuotaWarning && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold ${getQuotaColor()} shadow-lg`}
                title={getQuotaTooltip()}
              >
                {Math.round(quotaPercentage)}%
              </motion.div>
            )}

            {/* Settings */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </motion.button>

            {/* Theme Toggle */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {theme === 'light' ? (
                <Moon className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </motion.button>
          </div>
        </div>

        {/* Search (Mobile) */}
        <div className="mt-4 md:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-transparent focus:border-red-500 focus:bg-white dark:focus:bg-gray-900 transition-all outline-none"
            />
          </div>
        </div>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </motion.header>
  );
};
