import type { ChangeEvent, KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import {
	SEARCH_SCOPE_OPTIONS,
	type SearchScope,
} from "../lib/unified-search";

const ICON_SM = "h-4 w-4" as const;

interface HeaderSearchDesktopProps {
	searchPlaceholder: string;
	searchQuery: string;
	searchScope?: SearchScope;
	onSearchScopeChange?: (scope: SearchScope) => void;
	onSearchChange: (value: string) => void;
	onClear: () => void;
	onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export const HeaderSearchDesktop = ({
	searchPlaceholder,
	searchQuery,
	searchScope = "all",
	onSearchScopeChange,
	onSearchChange,
	onClear,
	onKeyDown,
}: HeaderSearchDesktopProps) => (
	<div className="desktop-header-controls hidden xl:flex flex-1 max-w-2xl gap-2">
		<select
			aria-label="Search scope"
			value={searchScope}
			onChange={(event) =>
				onSearchScopeChange?.(event.target.value as SearchScope)
			}
			className="rounded-full bg-gray-100 px-3 py-2 text-sm text-gray-700 outline-none focus:border-red-500 dark:bg-ios-800 dark:text-ios-200"
		>
			{SEARCH_SCOPE_OPTIONS.map((option) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
		<div className="relative min-w-0 flex-1">
			<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
			<input
				type="text"
				placeholder={searchPlaceholder}
				value={searchQuery}
				onChange={(e: ChangeEvent<HTMLInputElement>) =>
					onSearchChange(e.target.value)
				}
				onKeyDown={onKeyDown}
				className="w-full pl-10 pr-10 py-2 rounded-full bg-gray-100 dark:bg-ios-800 border-2 border-transparent focus:border-red-500 focus:bg-white dark:focus:bg-ios-900 transition-all outline-none"
			/>
			{searchQuery && (
				<button
					onClick={onClear}
					className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-ios-700 dark:hover:text-ios-200"
					title="Clear search"
				>
					<X className={ICON_SM} />
				</button>
			)}
		</div>
	</div>
);
