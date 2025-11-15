import { motion } from 'framer-motion';
import {
  Youtube,
  Sun,
  Moon,
  Search,
  Grid3x3,
  List,
  Download,
} from 'lucide-react';
import { OPMLUpload } from './OPMLUpload';
import { useStore } from '../store/useStore';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';
import type { SortBy } from '../types/youtube';

export const Header = () => {
  const {
    theme,
    toggleTheme,
    viewMode,
    setViewMode,
    sortBy,
    setSortBy,
    searchQuery,
    setSearchQuery,
  } = useStore();
  const { count, exportOPML } = useSubscriptionStorage();

  const handleExport = () => {
    try {
      exportOPML();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export subscriptions. Make sure you have subscriptions loaded.');
    }
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

          {/* Search */}
          <div className="flex-1 max-w-md">
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
                className={`p-2 rounded ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-gray-900 shadow'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                } transition-all`}
              >
                <Grid3x3 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-gray-900 shadow'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                } transition-all`}
              >
                <List className="w-5 h-5" />
              </button>
            </div>

            {/* Import OPML */}
            <OPMLUpload minimal />

            {/* Export OPML */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
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
      </div>
    </motion.header>
  );
};
