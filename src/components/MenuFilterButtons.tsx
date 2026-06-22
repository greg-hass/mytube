import { Eye, EyeOff, Play, SlidersHorizontal } from "lucide-react";

const ICON_SM = "h-4 w-4" as const;

interface MenuFilterButtonsProps {
	showFilters: boolean;
	onClose: () => void;
	onOpenFilters?: () => void;
	activeFilterCount: number;
	shortsVisible: boolean;
	onToggleShorts?: () => void;
	hideWatched: boolean;
	onToggleWatched?: () => void;
}

export const MenuFilterButtons = ({
	showFilters,
	onClose,
	onOpenFilters,
	activeFilterCount,
	shortsVisible,
	onToggleShorts,
	hideWatched,
	onToggleWatched,
}: MenuFilterButtonsProps) => (
	<>
		{showFilters && onOpenFilters && (
			<button
				onClick={() => {
					onClose();
					onOpenFilters();
				}}
				className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-semibold shadow-lg transition-colors ${
					activeFilterCount > 0
						? "bg-red-600 text-white shadow-red-950/20 hover:bg-red-700"
						: "bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-ios-800/90 dark:text-ios-100 dark:hover:bg-ios-700"
				}`}
			>
				<SlidersHorizontal className={ICON_SM} />
				Filters
				{activeFilterCount > 0 && (
					<span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs text-red-700 dark:bg-ios-700 dark:text-ios-200">
						{activeFilterCount}
					</span>
				)}
			</button>
		)}

		{showFilters && onToggleShorts && (
			<button
				onClick={() => {
					onClose();
					onToggleShorts();
				}}
				className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition-colors ${
					shortsVisible
						? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
						: "bg-gray-100 text-gray-700 dark:bg-ios-800/90 dark:text-ios-300"
				}`}
			>
				<Play className={ICON_SM} />
				{shortsVisible ? "Hide Shorts" : "Show Shorts"}
			</button>
		)}

		{showFilters && onToggleWatched && (
			<button
				onClick={() => {
					onClose();
					onToggleWatched();
				}}
				className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition-colors ${
					hideWatched
						? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
						: "bg-gray-100 text-gray-700 dark:bg-ios-800/90 dark:text-ios-300"
				}`}
			>
				{hideWatched ? (
					<EyeOff className={ICON_SM} />
				) : (
					<Eye className={ICON_SM} />
				)}
				{hideWatched ? "Show Watched" : "Hide Watched"}
			</button>
		)}
	</>
);
