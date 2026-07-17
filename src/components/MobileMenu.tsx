import { lazy, Suspense } from "react";
import { AlignJustify, Download, Grid3x3, List, Moon, RefreshCw, Settings, Sun, X } from "lucide-react";
import { RefreshStatusPanel } from "./RefreshStatusPanel";
import type { SyncStatus } from "../hooks/useRSSVideos";
import type { SortBy } from "../types/youtube";

const OPMLUpload = lazy(() =>
	import("./OPMLUpload").then((module) => ({ default: module.OPMLUpload })),
);

const ICON_SM = "h-4 w-4" as const;
const ICON_MD = "w-5 h-5" as const;

const SECTION_LABEL =
	"mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-ios-400";
const SECTION_DIVIDER =
	"border-t border-gray-200/80 dark:border-ios-800/60";
const SECONDARY_BUTTON =
	"flex items-center justify-center gap-2 rounded-lg bg-gray-100 px-3 py-3 text-gray-800 transition-colors hover:bg-gray-200 dark:bg-ios-800/90 dark:text-ios-100 dark:hover:bg-ios-700";

type ToggleAccent = "red" | "emerald";

function ToggleRow({
	label,
	hint,
	checked,
	accent,
	onToggle,
}: {
	label: string;
	hint?: string;
	checked: boolean;
	accent: ToggleAccent;
	onToggle?: () => void;
}) {
	const trackOn = accent === "red" ? "bg-red-500" : "bg-emerald-500";
	return (
		<div className="flex items-center justify-between gap-3 rounded-lg bg-gray-100 px-3 py-3 dark:bg-ios-800/90">
			<div className="min-w-0 flex-1">
				<span className="block text-sm font-medium text-gray-900 dark:text-ios-100">
					{label}
				</span>
				{hint && (
					<span className="mt-0.5 block text-xs text-gray-500 dark:text-ios-400">
						{hint}
					</span>
				)}
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				aria-label={label}
				onClick={() => onToggle?.()}
				className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-500 dark:focus-visible:ring-offset-ios-950 ${
					checked
						? trackOn
						: "bg-gray-300 dark:bg-ios-700"
				}`}
			>
				<span
					aria-hidden="true"
					className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
						checked ? "translate-x-5" : "translate-x-0.5"
					}`}
				/>
			</button>
		</div>
	);
}

interface MobileMenuProps {
	showMobileMenu: boolean;
	onClose: () => void;
	showShorts: boolean;
	onToggleShorts?: () => void;
	hideWatched: boolean;
	onToggleWatched?: () => void;
	sortBy: SortBy;
	onSortChange: (value: SortBy) => void;
	viewMode: "grid" | "list" | "compact";
	onViewModeChange: (mode: "grid" | "list" | "compact") => void;
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
	onRefresh?: () => void;
	isRefreshing?: boolean;
	refreshProgress?: number;
}

export const MobileMenu = ({
	showMobileMenu,
	onClose,
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
	onRefresh,
	isRefreshing = false,
	refreshProgress = 0,
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
			<aside className="safe-top absolute right-0 top-0 flex h-full w-[82vw] max-w-sm flex-col overflow-hidden border-l border-gray-200 bg-gray-50 shadow-2xl dark:border-ios-800/80 dark:bg-ios-950">
				<header className="flex shrink-0 items-center justify-between px-4 pb-3 pt-3">
					<div className="flex items-center gap-2.5">
						<span
							aria-hidden="true"
							className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm shadow-red-950/30"
						>
							<svg
								viewBox="0 0 24 24"
								className="h-4 w-4"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.25"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<line x1="3" y1="6" x2="21" y2="6" />
								<line x1="3" y1="12" x2="21" y2="12" />
								<line x1="3" y1="18" x2="21" y2="18" />
							</svg>
						</span>
						<p className="text-lg font-semibold tracking-tight text-gray-900 dark:text-ios-100">
							Menu
						</p>
					</div>
					<button
						onClick={onClose}
						className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-ios-200 dark:hover:bg-ios-800"
						title="Close menu"
					>
						<X className={ICON_MD} />
					</button>
				</header>

				<div className="flex-1 overflow-y-auto px-4 pb-4">
					<div className="space-y-4 pt-1">
						{/* Quick settings — top of the panel */}
						<div className="grid grid-cols-2 gap-2">
							<button
								onClick={onOpenSettings}
								className={SECONDARY_BUTTON}
							>
								<Settings className={ICON_SM} />
								Settings
							</button>
							<button
								onClick={onToggleTheme}
								className={SECONDARY_BUTTON}
							>
								{theme === "light" ? (
									<Moon className={ICON_SM} />
								) : (
									<Sun className={ICON_SM} />
								)}
								Theme
							</button>
						</div>

						<div className={SECTION_DIVIDER} role="separator" />

						{/* Data management */}
						<section className="space-y-2">
							<p className={SECTION_LABEL}>Import / Export</p>
							<div className="[&>button]:w-full [&>button]:justify-center [&>button]:py-3">
								<Suspense fallback={null}>
									<OPMLUpload minimal showLabelOnMobile />
								</Suspense>
							</div>
							<div className="grid grid-cols-2 gap-2">
								<button
									onClick={() => onExport("opml")}
									className={SECONDARY_BUTTON}
								>
									<Download className={ICON_SM} />
									OPML
								</button>
								<button
									onClick={() => onExport("json")}
									className={SECONDARY_BUTTON}
								>
									<Download className={ICON_SM} />
									JSON
								</button>
							</div>
						</section>

						<div className={SECTION_DIVIDER} role="separator" />

						{/* Sort + view layout */}
						<section className="space-y-2">
							<p className={SECTION_LABEL}>Sort</p>
							<select
								value={sortBy}
								onChange={(e) => onSortChange(e.target.value as SortBy)}
								className="w-full rounded-lg border border-transparent bg-gray-100 px-3 py-3 text-gray-800 outline-none transition-all focus:border-red-500 dark:bg-ios-800/90 dark:text-ios-100"
							>
								<option value="name">A–Z</option>
								<option value="recent">Recent</option>
								<option value="oldest">Oldest</option>
							</select>
							<div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-ios-800/90">
								<button
									onClick={() => onViewModeChange("grid")}
									className={`flex flex-1 items-center justify-center gap-2 rounded px-3 py-2.5 transition-all ${
										viewMode === "grid"
											? "bg-white text-gray-900 shadow-sm dark:bg-ios-950 dark:text-ios-50"
											: "text-gray-600 hover:bg-gray-200 dark:text-ios-300 dark:hover:bg-ios-700"
									}`}
								>
									<Grid3x3 className={ICON_SM} />
									Grid
								</button>
								<button
									onClick={() => onViewModeChange("list")}
									className={`flex flex-1 items-center justify-center gap-2 rounded px-3 py-2.5 transition-all ${
										viewMode === "list"
											? "bg-white text-gray-900 shadow-sm dark:bg-ios-950 dark:text-ios-50"
											: "text-gray-600 hover:bg-gray-200 dark:text-ios-300 dark:hover:bg-ios-700"
									}`}
								>
									<List className={ICON_SM} />
									List
								</button>
								<button
									onClick={() => onViewModeChange("compact")}
									className={`flex flex-1 items-center justify-center gap-2 rounded px-3 py-2.5 transition-all ${
										viewMode === "compact"
											? "bg-white text-gray-900 shadow-sm dark:bg-ios-950 dark:text-ios-50"
											: "text-gray-600 hover:bg-gray-200 dark:text-ios-300 dark:hover:bg-ios-700"
									}`}
								>
									<AlignJustify className={ICON_SM} />
									Compact
								</button>
							</div>
						</section>

						<div className={SECTION_DIVIDER} role="separator" />

						{/* Hide-from-feed toggles — wired to the same state as the
						    toolbar header icons on the Latest tab. */}
						<section className="space-y-2">
							<p className={SECTION_LABEL}>Hide from feed</p>
							<ToggleRow
								label="Hide Shorts"
								hint={
									shortsVisible
										? "Shorts are currently shown"
										: "Shorts are hidden from your feed"
								}
								checked={!shortsVisible}
								accent="red"
								onToggle={onToggleShorts}
							/>
							<ToggleRow
								label="Hide Watched"
								hint={
									hideWatched
										? "Watched videos are hidden"
										: "Watched videos are shown"
								}
								checked={hideWatched}
								accent="emerald"
								onToggle={onToggleWatched}
							/>
						</section>

						{syncStatus && cacheStatus && onRetryFailed && (
							<>
								<div className={SECTION_DIVIDER} role="separator" />
								<section className="space-y-2">
									<p className={SECTION_LABEL}>Feed health</p>
									<RefreshStatusPanel
										status={syncStatus}
										cacheStatus={cacheStatus}
										onRetryFailed={onRetryFailed}
										variant="menu"
									/>
								</section>
							</>
						)}
					</div>
					{onRefresh && (
						<button
							onClick={onRefresh}
							disabled={isRefreshing}
							aria-label={
								isRefreshing
									? `Refreshing feeds, ${refreshProgress}% complete`
									: "Refresh feeds"
							}
							className={`${SECONDARY_BUTTON} mt-2 w-full disabled:cursor-wait disabled:opacity-70`}
						>
							<RefreshCw
								className={`${ICON_SM} ${isRefreshing ? "animate-spin" : ""}`}
							/>
							{isRefreshing ? `Refreshing ${refreshProgress}%` : "Refresh feeds"}
						</button>
					)}
				</div>
			</aside>
		</div>
	);
};
