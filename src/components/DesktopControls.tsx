import { Suspense, lazy } from "react";
import { motion } from "framer-motion";
import {
	Download,
	AlignJustify,
	Eye,
	EyeOff,
	Grid3x3,
	List,
	Moon,
	Play,
	Settings,
	Sun,
	RefreshCw,
} from "lucide-react";
import type { SortBy } from "../types/youtube";

const OPMLUpload = lazy(() =>
	import("./OPMLUpload").then((module) => ({ default: module.OPMLUpload })),
);

const ICON_MD = "w-5 h-5" as const;

interface DesktopControlsProps {
	theme: "light" | "dark";
	showShorts: boolean;
	onToggleShorts?: () => void;
	hideWatched: boolean;
	onToggleWatched?: () => void;
	showExportMenu: boolean;
	onToggleExportMenu: () => void;
	onExport: (format: "opml" | "json") => void;
	sortBy: SortBy;
	onSortChange: (value: SortBy) => void;
	viewMode: "grid" | "list" | "compact";
	onViewModeChange: (mode: "grid" | "list" | "compact") => void;
	onOpenSettings: () => void;
	onToggleTheme: () => void;
	onRefresh?: () => void;
	isRefreshing?: boolean;
	refreshProgress?: number;
	/** When true, hide playback/filter/import/export controls — keep only Settings + Theme. */
	minimal?: boolean;
}

export const DesktopControls = ({
	theme,
	showShorts,
	onToggleShorts,
	hideWatched,
	onToggleWatched,
	showExportMenu,
	onToggleExportMenu,
	onExport,
	sortBy,
	onSortChange,
	viewMode,
	onViewModeChange,
	onOpenSettings,
	onToggleTheme,
	onRefresh,
	isRefreshing = false,
	refreshProgress = 0,
	minimal = false,
}: DesktopControlsProps) => (
	<div className="desktop-header-controls hidden xl:flex items-center gap-2">
		{!minimal && (
			<>
				{onRefresh && (
					<motion.button
						whileHover={{ scale: 1.05 }}
						whileTap={{ scale: 0.95 }}
						onClick={onRefresh}
						disabled={isRefreshing}
						aria-label={
							isRefreshing
								? `Refreshing feeds, ${refreshProgress}% complete`
								: "Refresh feeds"
						}
						title={isRefreshing ? "Refreshing feeds" : "Refresh feeds"}
						className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-wait disabled:opacity-70 dark:bg-ios-800 dark:text-ios-200 dark:hover:bg-ios-700"
					>
						<RefreshCw
							className={`${ICON_MD} ${isRefreshing ? "animate-spin" : ""}`}
						/>
						<span>{isRefreshing ? `${refreshProgress}%` : "Refresh"}</span>
					</motion.button>
				)}

				{/* Shorts Toggle */}
				{onToggleShorts && (
					<motion.button
						whileHover={{ scale: 1.05 }}
						whileTap={{ scale: 0.95 }}
						onClick={onToggleShorts}
						aria-label={showShorts ? "Hide Shorts" : "Show Shorts"}
						aria-pressed={showShorts}
						className={`p-2 rounded-lg transition-colors ${
							showShorts
								? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
								: "bg-gray-100 text-gray-500 dark:bg-ios-800 dark:text-ios-400"
						}`}
						title={showShorts ? "Hide Shorts" : "Show Shorts"}
					>
						<Play className={ICON_MD} />
					</motion.button>
				)}

				{/* Watched Toggle */}
				{onToggleWatched && (
					<motion.button
						whileHover={{ scale: 1.05 }}
						whileTap={{ scale: 0.95 }}
						onClick={onToggleWatched}
						aria-label={hideWatched ? "Show Watched" : "Hide Watched"}
						aria-pressed={hideWatched}
						className={`p-2 rounded-lg transition-colors ${
							hideWatched
								? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
								: "bg-gray-100 text-gray-500 dark:bg-ios-800 dark:text-ios-400"
						}`}
						title={hideWatched ? "Show Watched" : "Hide Watched"}
					>
						{hideWatched ? (
							<EyeOff className={ICON_MD} />
						) : (
							<Eye className={ICON_MD} />
						)}
					</motion.button>
				)}

				{/* Sort */}
				<select
					aria-label="Sort subscriptions"
					value={sortBy}
					onChange={(e) => onSortChange(e.target.value as SortBy)}
					className="hidden sm:block px-3 py-2 rounded-lg bg-gray-100 dark:bg-ios-800 border-2 border-transparent focus:border-red-500 transition-all outline-none cursor-pointer"
				>
					<option value="name">A-Z</option>
					<option value="recent">Recent</option>
					<option value="oldest">Oldest</option>
				</select>

				{/* View Mode */}
				<div className="hidden sm:flex items-center gap-1 p-1 rounded-lg bg-gray-100 dark:bg-ios-800">
					<button
						onClick={() => onViewModeChange("grid")}
						aria-label="Grid subscription view"
						aria-pressed={viewMode === "grid"}
						title="Grid view"
						className={`p-2 rounded ${
							viewMode === "grid"
								? "bg-white dark:bg-ios-900 shadow"
								: "hover:bg-gray-200 dark:hover:bg-ios-700"
						} transition-all`}
					>
						<Grid3x3 className={ICON_MD} />
					</button>
					<button
						onClick={() => onViewModeChange("list")}
						aria-label="List subscription view"
						aria-pressed={viewMode === "list"}
						title="List view"
						className={`p-2 rounded ${
							viewMode === "list"
								? "bg-white dark:bg-ios-900 shadow"
								: "hover:bg-gray-200 dark:hover:bg-ios-700"
						} transition-all`}
					>
						<List className={ICON_MD} />
					</button>
					<button
						onClick={() => onViewModeChange("compact")}
						aria-label="Compact subscription view"
						aria-pressed={viewMode === "compact"}
						title="Compact view"
						className={`p-2 rounded ${
							viewMode === "compact"
								? "bg-white dark:bg-ios-900 shadow"
								: "hover:bg-gray-200 dark:hover:bg-ios-700"
						} transition-all`}
					>
						<AlignJustify className={ICON_MD} />
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
						onClick={onToggleExportMenu}
						aria-label="Export subscriptions"
						title="Export subscriptions"
						className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-ios-800 hover:bg-gray-200 dark:hover:bg-ios-700 transition-colors"
					>
						<Download className="w-4 h-4" />
						<span className="hidden sm:inline">Export</span>
					</motion.button>

					{showExportMenu && (
						<>
							<div
								className="fixed inset-0 z-40"
								onClick={onToggleExportMenu}
							/>
							<div className="absolute right-0 top-12 w-40 bg-white dark:bg-ios-900 rounded-lg shadow-xl border border-gray-200 dark:border-ios-800 z-50 overflow-hidden">
								<button
									onClick={() => onExport("opml")}
									className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-ios-800 transition-colors"
								>
									OPML
								</button>
								<button
									onClick={() => onExport("json")}
									className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-ios-800 transition-colors"
								>
									JSON
								</button>
							</div>
						</>
					)}
				</div>
			</>
		)}

		{/* Settings — always visible */}
		<motion.button
			whileHover={{ scale: 1.1 }}
			whileTap={{ scale: 0.9 }}
			onClick={onOpenSettings}
			aria-label="Settings"
			className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-ios-800 transition-colors"
			title="Settings"
		>
			<Settings className={ICON_MD} />
		</motion.button>

		{/* Theme Toggle — always visible */}
		<motion.button
			whileHover={{ scale: 1.1 }}
			whileTap={{ scale: 0.9 }}
			onClick={onToggleTheme}
			aria-label={theme === "light" ? "Use dark theme" : "Use light theme"}
			title={theme === "light" ? "Use dark theme" : "Use light theme"}
			className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-ios-800 transition-colors"
		>
			{theme === "light" ? (
				<Moon className={ICON_MD} />
			) : (
				<Sun className={ICON_MD} />
			)}
		</motion.button>
	</div>
);
