import { motion } from "framer-motion";
import { useState } from "react";
import { DesktopControls } from "./DesktopControls";
import { HeaderSearchDesktop } from "./HeaderSearchDesktop";
import { HeaderSearchMobile } from "./HeaderSearchMobile";
import { MobileHeaderControls } from "./MobileHeaderControls";
import { MobileMenu } from "./MobileMenu";
import { SettingsModal } from "./SettingsModal";
import { useStore } from "../store/useStore";
import {
	useSubscriptionCount,
	useExportHandlers,
} from "../hooks/useSubscriptionStorage";
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
	scrollHidden?: boolean;
	compactMobile?: boolean;
	/** When true, only logo/settings/theme are shown — hides controls with no value before onboarding. */
	minimal?: boolean;
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
	scrollHidden = false,
	compactMobile = false,
	minimal = false,
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
	const count = useSubscriptionCount();
	const { exportOPML, exportJSON } = useExportHandlers();
	const [showExportMenu, setShowExportMenu] = useState(false);
	const [showMobileMenu, setShowMobileMenu] = useState(false);
	const [showMobileSearchPanel, setShowMobileSearchPanel] = useState(false);
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
				transition={
					compactMobile
						? { type: "spring", stiffness: 260, damping: 38 }
						: { type: "spring", stiffness: 400, damping: 35 }
				}
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
								alt="MyTube"
								className="h-10 w-10 rounded-xl shadow-lg"
							/>
							<div>
								<h1 className="text-lg md:text-xl font-bold tracking-tight">
									<span className="text-white dark:text-ios-50">My</span>
									<span className="text-red-600 dark:text-red-500">Tube</span>
								</h1>
								<div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-ios-400">
									{syncStatus?.isSyncing && (
										<span
											aria-hidden="true"
											className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)] animate-pulse"
										/>
									)}
									<p>{count} channels</p>
								</div>
							</div>
						</motion.div>

						{!minimal && (
							<HeaderSearchDesktop
								searchPlaceholder={searchPlaceholder}
								searchQuery={searchQuery}
								onSearchChange={setSearchQuery}
								onClear={clearSearch}
								onKeyDown={handleSearchKeyDown}
							/>
						)}

						<DesktopControls
							theme={theme}
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
							minimal={minimal}
						/>

						{!minimal && (
							<MobileHeaderControls
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
						)}
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
				</div>
			</motion.header>

			<MobileMenu
				showMobileMenu={showMobileMenu}
				onClose={() => setShowMobileMenu(false)}
				showShorts={showShorts}
				onToggleShorts={onToggleShorts}
				hideWatched={hideWatched}
				onToggleWatched={onToggleWatched}
				sortBy={sortBy}
				onSortChange={setSortBy}
				viewMode={viewMode}
				onViewModeChange={setViewMode}
				onExport={handleExport}
				onOpenSettings={() => setIsSettingsOpen(true)}
				onToggleTheme={toggleTheme}
				theme={theme}
				syncStatus={syncStatus}
				cacheStatus={cacheStatus}
				onRetryFailed={onRetryFailed}
			/>

			<SettingsModal
				isOpen={isSettingsOpen}
				onClose={() => setIsSettingsOpen(false)}
			/>
		</>
	);
};
