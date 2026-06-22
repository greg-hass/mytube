import { motion } from "framer-motion";
import { useState } from "react";
import { DesktopControls } from "./DesktopControls";
import { HeaderSearchDesktop } from "./HeaderSearchDesktop";
import { HeaderSearchMobile } from "./HeaderSearchMobile";
import { MobileHeaderControls } from "./MobileHeaderControls";
import { MobileMenu } from "./MobileMenu";
import { SettingsModal } from "./SettingsModal";
import { RefreshStatusPanel } from "./RefreshStatusPanel";
import { useStore } from "../store/useStore";
import { useSubscriptionStorage } from "../hooks/useSubscriptionStorage";
import { useHeaderHeight } from "../hooks/useHeaderHeight";
import type { SyncStatus } from "../hooks/useRSSVideos";

interface HeaderProps {
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
	onOpenFilters?: () => void;
	activeFilterCount?: number;
	scrollHidden?: boolean;
}

export const Header = ({
	showMobileSearch = true,
	searchPlaceholder = "Search channels...",
	syncStatus,
	cacheStatus,
	onRetryFailed,
	showShorts = true,
	onToggleShorts,
	hideWatched = false,
	onToggleWatched,
	showFilters = true,
	onOpenFilters,
	activeFilterCount = 0,
	scrollHidden = false,
}: HeaderProps) => {
	const headerRef = useHeaderHeight();
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
	const showRefreshHealthPanel = Boolean(
		syncStatus?.isSyncing && cacheStatus && onRetryFailed,
	);

	const handleExport = (format: "opml" | "json") => {
		try {
			if (format === "opml") {
				exportOPML();
			} else {
				exportJSON();
			}
			setShowExportMenu(false);
		} catch (error) {
			console.error("Export failed:", error);
			alert(
				"Failed to export subscriptions. Make sure you have subscriptions loaded.",
			);
		}
	};

	const clearSearch = () => {
		setSearchQuery("");
	};

	const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			clearSearch();
		}
	};

	return (
		<>
			<motion.header
				ref={headerRef}
				initial={{ y: -100 }}
				animate={scrollHidden ? { y: "-100%" } : { y: 0 }}
				transition={{ type: "spring", stiffness: 400, damping: 35 }}
				className="sticky top-0 z-50 glass safe-top border-b border-gray-200 dark:border-ios-800/80 shadow-sm"
			>
				<div className="max-w-7xl mx-auto px-4">
					<div className="flex h-[var(--app-header-height)] items-center justify-between gap-3 xl:gap-4">
						{/* Logo */}
						<motion.div
							whileHover={{ scale: 1.05 }}
							className="flex items-center gap-3"
						>
							<img
								src="/icon-192.png"
								alt="YouTube RSS"
								className="h-10 w-10 rounded-xl shadow-lg"
							/>
							<div>
								<h1 className="text-lg md:text-xl font-bold bg-gradient-to-r from-red-600 to-red-500 bg-clip-text text-transparent">
									YouTube RSS
								</h1>
								<p className="text-xs text-gray-500 dark:text-ios-400">
									{count} channels
								</p>
							</div>
						</motion.div>

						<HeaderSearchDesktop
							searchPlaceholder={searchPlaceholder}
							searchQuery={searchQuery}
							onSearchChange={setSearchQuery}
							onClear={clearSearch}
							onKeyDown={handleSearchKeyDown}
						/>

						<DesktopControls
							theme={theme}
							showFilters={showFilters}
							onOpenFilters={onOpenFilters}
							activeFilterCount={activeFilterCount}
							showShorts={showShorts}
							onToggleShorts={onToggleShorts}
							hideWatched={hideWatched}
							onToggleWatched={onToggleWatched}
							showExportMenu={showExportMenu}
							onToggleExportMenu={() => setShowExportMenu(!showExportMenu)}
							onExport={handleExport}
							sortBy={sortBy}
							onSortChange={setSortBy}
							viewMode={viewMode}
							onViewModeChange={setViewMode}
							onOpenSettings={() => setIsSettingsOpen(true)}
							onToggleTheme={toggleTheme}
						/>

						<MobileHeaderControls
							showFilters={showFilters}
							onOpenFilters={onOpenFilters}
							activeFilterCount={activeFilterCount}
							showShorts={showShorts}
							onToggleShorts={onToggleShorts}
							hideWatched={hideWatched}
							onToggleWatched={onToggleWatched}
							showMobileSearch={showMobileSearch}
							showMobileSearchPanel={showMobileSearchPanel}
							onToggleSearch={() =>
								setShowMobileSearchPanel((isOpen) => !isOpen)
							}
							onOpenMenu={() => setShowMobileMenu(true)}
						/>
					</div>

					<HeaderSearchMobile
						searchPlaceholder={searchPlaceholder}
						searchQuery={searchQuery}
						visible={showMobileSearch && showMobileSearchPanel}
						onSearchChange={setSearchQuery}
						onClear={() => {
							clearSearch();
							setShowMobileSearchPanel(false);
						}}
						onKeyDown={handleSearchKeyDown}
					/>
					{showRefreshHealthPanel &&
						syncStatus &&
						cacheStatus &&
						onRetryFailed && (
							<div
								data-testid="mobile-refresh-health-panel"
								className="mobile-header-search pb-3 xl:hidden"
							>
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

			<MobileMenu
				showMobileMenu={showMobileMenu}
				onClose={() => setShowMobileMenu(false)}
				channelCount={count}
				showFilters={showFilters}
				onOpenFilters={onOpenFilters}
				activeFilterCount={activeFilterCount}
				showShorts={showShorts}
				onToggleShorts={onToggleShorts}
				hideWatched={hideWatched}
				onToggleWatched={onToggleWatched}
				syncStatus={syncStatus}
				cacheStatus={cacheStatus}
				onRetryFailed={onRetryFailed}
				sortBy={sortBy}
				onSortChange={setSortBy}
				viewMode={viewMode}
				onViewModeChange={setViewMode}
				onExport={handleExport}
				onOpenSettings={() => setIsSettingsOpen(true)}
				onToggleTheme={toggleTheme}
				theme={theme}
			/>

			<SettingsModal
				isOpen={isSettingsOpen}
				onClose={() => setIsSettingsOpen(false)}
			/>
		</>
	);
};
