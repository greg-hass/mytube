import { lazy, Suspense } from "react";
import { Download, Grid3x3, List, Moon, Settings, Sun, X } from "lucide-react";
import { MenuFilterButtons } from "./MenuFilterButtons";
import { RefreshStatusPanel } from "./RefreshStatusPanel";
import type { SyncStatus } from "../hooks/useRSSVideos";
import type { SortBy } from "../types/youtube";

const OPMLUpload = lazy(() =>
	import("./OPMLUpload").then((module) => ({ default: module.OPMLUpload })),
);

const ICON_SM = "h-4 w-4" as const;
const ICON_MD = "w-5 h-5" as const;

interface MobileMenuProps {
	showMobileMenu: boolean;
	onClose: () => void;
	channelCount: number;
	showFilters: boolean;
	onOpenFilters?: () => void;
	activeFilterCount: number;
	showShorts: boolean;
	onToggleShorts?: () => void;
	hideWatched: boolean;
	onToggleWatched?: () => void;
	sortBy: SortBy;
	onSortChange: (value: SortBy) => void;
	viewMode: "grid" | "list";
	onViewModeChange: (mode: "grid" | "list") => void;
	onExport: (format: "opml" | "json") => void;
	onOpenSettings: () => void;
	onToggleTheme: () => void;
	theme: "light" | "dark";
	syncStatus?: SyncStatus;
	cacheStatus?: {
		hasCache: boolean;
		isStale: boolean;
		age: number;
		videoCount: number;
	};
	onRetryFailed?: () => void;
}

export const MobileMenu = ({
	showMobileMenu,
	onClose,
	channelCount,
	showFilters,
	onOpenFilters,
	activeFilterCount,
	showShorts: shortsVisible,
	onToggleShorts,
	hideWatched,
	onToggleWatched,
	sortBy,
	onSortChange,
	viewMode,
	onViewModeChange,
	onExport,
	onOpenSettings,
	onToggleTheme,
	theme,
	syncStatus,
	cacheStatus,
	onRetryFailed,
}: MobileMenuProps) => {
	if (!showMobileMenu) return null;

	return (
		<div
			data-testid="mobile-menu-panel"
			className="mobile-menu-overlay fixed inset-0 z-[100] xl:hidden"
		>
			<button
				className="absolute inset-0 bg-gray-950/60 backdrop-blur-[2px]"
				aria-label="Close menu"
				onClick={onClose}
			/>
			<aside className="safe-top absolute right-0 top-0 h-full w-[82vw] max-w-sm overflow-y-auto border-l border-gray-200 bg-gray-50 p-4 shadow-2xl dark:border-ios-800/80 dark:bg-ios-950">
				<div className="mb-5 flex items-center justify-between">
					<div>
						<p className="text-lg font-semibold text-gray-900 dark:text-ios-100">
							Menu
						</p>
						<p className="text-sm text-gray-500 dark:text-ios-400">
							{channelCount} channels
						</p>
					</div>
					<button
						onClick={onClose}
						className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-ios-200 dark:hover:bg-ios-800"
						title="Close menu"
					>
						<X className={ICON_MD} />
					</button>
				</div>

				<div className="space-y-3">
					<MenuFilterButtons
						showFilters={showFilters}
						onClose={onClose}
						onOpenFilters={onOpenFilters}
						activeFilterCount={activeFilterCount}
						shortsVisible={shortsVisible}
						onToggleShorts={onToggleShorts}
						hideWatched={hideWatched}
						onToggleWatched={onToggleWatched}
					/>

					<div>
						<label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-ios-400">
							Sort
						</label>
						<select
							value={sortBy}
							onChange={(e) => onSortChange(e.target.value as SortBy)}
							className="w-full rounded-lg border border-transparent bg-gray-100 px-3 py-3 outline-none transition-all focus:border-red-500 dark:bg-ios-800/90"
						>
							<option value="name">A-Z</option>
							<option value="recent">Recent</option>
							<option value="oldest">Oldest</option>
						</select>
					</div>

					<div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-ios-800/90">
						<button
							onClick={() => onViewModeChange("grid")}
							className={`flex flex-1 items-center justify-center gap-2 rounded px-3 py-3 ${
								viewMode === "grid"
									? "bg-white shadow dark:bg-ios-950"
									: "hover:bg-gray-200 dark:hover:bg-ios-700"
							} transition-all`}
						>
							<Grid3x3 className={ICON_SM} />
							Grid
						</button>
						<button
							onClick={() => onViewModeChange("list")}
							className={`flex flex-1 items-center justify-center gap-2 rounded px-3 py-3 ${
								viewMode === "list"
									? "bg-white shadow dark:bg-ios-950"
									: "hover:bg-gray-200 dark:hover:bg-ios-700"
							} transition-all`}
						>
							<List className={ICON_SM} />
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
							onClick={() => onExport("opml")}
							className="flex items-center justify-center gap-2 rounded-lg bg-gray-100 px-3 py-3 hover:bg-gray-200 dark:bg-ios-800/90 dark:hover:bg-ios-700"
						>
							<Download className={ICON_SM} />
							OPML
						</button>
						<button
							onClick={() => onExport("json")}
							className="flex items-center justify-center gap-2 rounded-lg bg-gray-100 px-3 py-3 hover:bg-gray-200 dark:bg-ios-800/90 dark:hover:bg-ios-700"
						>
							<Download className={ICON_SM} />
							JSON
						</button>
					</div>

					{syncStatus && cacheStatus && onRetryFailed && (
						<div className="space-y-2 pt-1">
							<p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-ios-400">
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

					<div className="grid grid-cols-2 gap-2 pt-2">
						<button
							onClick={onOpenSettings}
							className="flex items-center justify-center gap-2 rounded-lg bg-gray-100 px-3 py-3 hover:bg-gray-200 dark:bg-ios-800/90 dark:hover:bg-ios-700"
						>
							<Settings className={ICON_SM} />
							Settings
						</button>
						<button
							onClick={onToggleTheme}
							className="flex items-center justify-center gap-2 rounded-lg bg-gray-100 px-3 py-3 hover:bg-gray-200 dark:bg-ios-800/90 dark:hover:bg-ios-700"
						>
							{theme === "light" ? (
								<Moon className={ICON_SM} />
							) : (
								<Sun className={ICON_SM} />
							)}
							Theme
						</button>
					</div>
				</div>
			</aside>
		</div>
	);
};
