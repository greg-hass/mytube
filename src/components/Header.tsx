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
  Menu,
  X,
  Play,
  Eye,
  EyeOff,
} from 'lucide-react';
import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { SettingsModal } from './SettingsModal';
import { RefreshStatusPanel } from './RefreshStatusPanel';
import { useStore } from '../store/useStore';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';
import type { SyncStatus } from '../hooks/useRSSVideos';
import type { SortBy } from '../types/youtube';

const OPMLUpload = lazy(() => import('./OPMLUpload').then((module) => ({ default: module.OPMLUpload })));

interface HeaderProps {
  onAddChannel?: () => void;
  showMobileSearch?: boolean;
  searchPlaceholder?: string;
  syncStatus?: SyncStatus;
  cacheStatus?: {
    hasCache: boolean;
    isStale: boolean;
    age: number;
    videoCount: number;
  };
  onRetryFailed?: () => void;
  showShorts?: boolean;
  onToggleShorts?: () => void;
  hideWatched?: boolean;
  onToggleWatched?: () => void;
  showFilters?: boolean;
}

export const Header = ({
  onAddChannel,
  showMobileSearch = true,
  searchPlaceholder = 'Search channels...',
  syncStatus,
  cacheStatus,
  onRetryFailed,
  showShorts = true,
  onToggleShorts,
  hideWatched = false,
  onToggleWatched,
  showFilters = true,
}: HeaderProps) => {
  const headerRef = useRef<HTMLElement | null>(null);
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
  } = useStore();
  const { count, exportOPML, exportJSON } = useSubscriptionStorage();
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMobileSearchPanel, setShowMobileSearchPanel] = useState(false);
  const showRefreshHealthPanel = Boolean(syncStatus?.isSyncing && cacheStatus && onRetryFailed);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header || typeof document === 'undefined') return;

    const updateHeaderHeight = () => {
      document.documentElement.style.setProperty('--app-current-header-height', `${header.offsetHeight}px`);
    };

    updateHeaderHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeaderHeight);
      return () => {
        window.removeEventListener('resize', updateHeaderHeight);
        document.documentElement.style.removeProperty('--app-current-header-height');
      };
    }

    const resizeObserver = new ResizeObserver(updateHeaderHeight);
    resizeObserver.observe(header);

    return () => {
      resizeObserver.disconnect();
      document.documentElement.style.removeProperty('--app-current-header-height');
    };
  }, []);

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

  return (
    <>
      <motion.header
        ref={headerRef}
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className="sticky top-0 z-50 glass safe-top border-b border-gray-200 dark:border-gray-800/80 shadow-sm"
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex h-[var(--app-header-height)] items-center justify-between gap-3 xl:gap-4">
            {/* Logo */}
            <motion.div
            whileHover={{ scale: 1.05 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-600 to-red-500 flex items-center justify-center shadow-lg">
              <Youtube className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold bg-gradient-to-r from-red-600 to-red-500 bg-clip-text text-transparent">
                YouTube RSS
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {count} channels
              </p>
            </div>
          </motion.div>

          {/* Search (Desktop) */}
          <div className="desktop-header-controls hidden xl:block flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-transparent focus:border-red-500 focus:bg-white dark:focus:bg-gray-900 transition-all outline-none"
              />
            </div>
          </div>

          {/* Controls */}
          <div className="desktop-header-controls hidden xl:flex items-center gap-2">
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

            {/* Shorts Toggle */}
            {showFilters && onToggleShorts && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onToggleShorts}
                className={`p-2 rounded-lg transition-colors ${
                  showShorts
                    ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`}
                title={showShorts ? 'Hide Shorts' : 'Show Shorts'}
              >
                <Play className="w-5 h-5" />
              </motion.button>
            )}

            {/* Watched Toggle */}
            {showFilters && onToggleWatched && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onToggleWatched}
                className={`p-2 rounded-lg transition-colors ${
                  hideWatched
                    ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`}
                title={hideWatched ? 'Show Watched' : 'Hide Watched'}
              >
                {hideWatched ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
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
            <Suspense fallback={null}>
              <OPMLUpload minimal />
            </Suspense>

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

          <div className="mobile-header-controls flex xl:hidden items-center gap-2">
            {onAddChannel && (
              <button
                data-testid="mobile-add-channel-button"
                onClick={onAddChannel}
                className="p-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                title="Add channel"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
            {showFilters && onToggleShorts && (
              <button
                data-testid="mobile-shorts-toggle"
                onClick={onToggleShorts}
                className={`p-2 rounded-lg transition-colors ${
                  showShorts
                    ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`}
                title={showShorts ? 'Hide Shorts' : 'Show Shorts'}
              >
                <Play className="w-5 h-5" />
              </button>
            )}
            {showFilters && onToggleWatched && (
              <button
                data-testid="mobile-watched-toggle"
                onClick={onToggleWatched}
                className={`p-2 rounded-lg transition-colors ${
                  hideWatched
                    ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`}
                title={hideWatched ? 'Show Watched' : 'Hide Watched'}
              >
                {hideWatched ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            )}
            {showMobileSearch && (
              <button
                data-testid="mobile-search-button"
                onClick={() => setShowMobileSearchPanel((isOpen) => !isOpen)}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="Search"
              >
                {showMobileSearchPanel ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
              </button>
            )}
            <button
              data-testid="mobile-menu-button"
              onClick={() => setShowMobileMenu(true)}
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
          </div>

          {/* Search (Mobile) */}
          {showMobileSearch && showMobileSearchPanel && <div className="mobile-header-search pb-3 xl:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-transparent focus:border-red-500 focus:bg-white dark:focus:bg-gray-900 transition-all outline-none"
            />
            <button
              onClick={() => setShowMobileSearchPanel(false)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              title="Close search"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>}
          {showRefreshHealthPanel && syncStatus && cacheStatus && onRetryFailed && (
            <div data-testid="mobile-refresh-health-panel" className="mobile-header-search pb-3 xl:hidden">
              <RefreshStatusPanel
                status={syncStatus}
                cacheStatus={cacheStatus}
                onRetryFailed={onRetryFailed}
                variant="compact"
              />
            </div>
          )}
        </div>
      </motion.header>

      {showMobileMenu && (
        <div data-testid="mobile-menu-panel" className="mobile-menu-overlay fixed inset-0 z-[100] xl:hidden">
          <button
            className="absolute inset-0 bg-gray-950/60 backdrop-blur-[2px]"
            aria-label="Close menu"
            onClick={() => setShowMobileMenu(false)}
          />
          <aside className="safe-top absolute right-0 top-0 h-full w-[82vw] max-w-sm overflow-y-auto border-l border-gray-200 bg-gray-50 p-4 shadow-2xl dark:border-gray-800/80 dark:bg-gray-950">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">Menu</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{count} channels</p>
              </div>
              <button
                onClick={() => setShowMobileMenu(false)}
                className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                title="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              {onAddChannel && (
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    onAddChannel();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 font-semibold text-white shadow-lg shadow-red-950/20 hover:bg-red-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Channel
                </button>
              )}

              {showFilters && onToggleShorts && (
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    onToggleShorts();
                  }}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition-colors ${
                    showShorts
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800/90 dark:text-gray-300'
                  }`}
                >
                  <Play className="h-4 w-4" />
                  {showShorts ? 'Hide Shorts' : 'Show Shorts'}
                </button>
              )}

              {showFilters && onToggleWatched && (
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    onToggleWatched();
                  }}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition-colors ${
                    hideWatched
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800/90 dark:text-gray-300'
                  }`}
                >
                  {hideWatched ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  {hideWatched ? 'Show Watched' : 'Hide Watched'}
                </button>
              )}

              {syncStatus && cacheStatus && onRetryFailed && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Feed health
                  </p>
                  <RefreshStatusPanel
                    status={syncStatus}
                    cacheStatus={cacheStatus}
                    onRetryFailed={onRetryFailed}
                    variant="menu"
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Sort
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  className="w-full rounded-lg border border-transparent bg-gray-100 px-3 py-3 outline-none transition-all focus:border-red-500 dark:bg-gray-800/90"
                >
                  <option value="name">A-Z</option>
                  <option value="recent">Recent</option>
                  <option value="oldest">Oldest</option>
                </select>
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800/90">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded px-3 py-3 ${viewMode === 'grid'
                    ? 'bg-white shadow dark:bg-gray-950'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                    } transition-all`}
                >
                  <Grid3x3 className="h-4 w-4" />
                  Grid
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded px-3 py-3 ${viewMode === 'list'
                    ? 'bg-white shadow dark:bg-gray-950'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                    } transition-all`}
                >
                  <List className="h-4 w-4" />
                  List
                </button>
              </div>

              <div className="[&>button]:w-full [&>button]:justify-center [&>button]:py-3">
                <Suspense fallback={null}>
                  <OPMLUpload minimal showLabelOnMobile />
                </Suspense>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleExport('opml')}
                  className="flex items-center justify-center gap-2 rounded-lg bg-gray-100 px-3 py-3 hover:bg-gray-200 dark:bg-gray-800/90 dark:hover:bg-gray-700"
                >
                  <Download className="h-4 w-4" />
                  OPML
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="flex items-center justify-center gap-2 rounded-lg bg-gray-100 px-3 py-3 hover:bg-gray-200 dark:bg-gray-800/90 dark:hover:bg-gray-700"
                >
                  <Download className="h-4 w-4" />
                  JSON
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="flex items-center justify-center gap-2 rounded-lg bg-gray-100 px-3 py-3 hover:bg-gray-200 dark:bg-gray-800/90 dark:hover:bg-gray-700"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </button>
                <button
                  onClick={toggleTheme}
                  className="flex items-center justify-center gap-2 rounded-lg bg-gray-100 px-3 py-3 hover:bg-gray-200 dark:bg-gray-800/90 dark:hover:bg-gray-700"
                >
                  {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  Theme
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
};
