import {
	Eye,
	EyeOff,
	Menu,
	Play,
	Search,
	X,
	RefreshCw,
} from "lucide-react";

const ICON_MD = "w-5 h-5" as const;

interface MobileHeaderControlsProps {
	showShorts: boolean;
	onToggleShorts?: () => void;
	hideWatched: boolean;
	onToggleWatched?: () => void;
	showMobileSearch: boolean;
	showMobileSearchPanel: boolean;
	onToggleSearch: () => void;
	onOpenMenu: () => void;
	onRefresh?: () => void;
	isRefreshing?: boolean;
	refreshProgress?: number;
}

export const MobileHeaderControls = ({
	showShorts,
	onToggleShorts,
	hideWatched,
	onToggleWatched,
	showMobileSearch,
	showMobileSearchPanel,
	onToggleSearch,
	onOpenMenu,
	onRefresh,
	isRefreshing = false,
	refreshProgress = 0,
}: MobileHeaderControlsProps) => (
	<div className="mobile-header-controls flex xl:hidden items-center gap-2">
		{onRefresh && (
			<button
				data-testid="mobile-refresh-button"
				onClick={onRefresh}
				disabled={isRefreshing}
				aria-label={
					isRefreshing
						? `Refreshing feeds, ${refreshProgress}% complete`
						: "Refresh feeds"
				}
				title={isRefreshing ? "Refreshing feeds" : "Refresh feeds"}
				className="p-2 rounded-lg bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-wait disabled:opacity-70 dark:bg-ios-800 dark:text-ios-200 dark:hover:bg-ios-700"
			>
				<RefreshCw
					className={`${ICON_MD} ${isRefreshing ? "animate-spin" : ""}`}
				/>
			</button>
		)}
		{onToggleShorts && (
			<button
				data-testid="mobile-shorts-toggle"
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
			</button>
		)}
		{onToggleWatched && (
			<button
				data-testid="mobile-watched-toggle"
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
			</button>
		)}
		{showMobileSearch && (
			<button
				data-testid="mobile-search-button"
				onClick={onToggleSearch}
				aria-label={showMobileSearchPanel ? "Close search" : "Search"}
				className="p-2 rounded-lg bg-gray-100 dark:bg-ios-800 hover:bg-gray-200 dark:hover:bg-ios-700 transition-colors"
				title="Search"
			>
				{showMobileSearchPanel ? (
					<X className={ICON_MD} />
				) : (
					<Search className={ICON_MD} />
				)}
			</button>
		)}
		<button
			data-testid="mobile-menu-button"
			onClick={onOpenMenu}
			aria-label="Open menu"
			className="p-2 rounded-lg bg-gray-100 dark:bg-ios-800 hover:bg-gray-200 dark:hover:bg-ios-700 transition-colors"
			title="Open menu"
		>
			<Menu className={ICON_MD} />
		</button>
	</div>
);
