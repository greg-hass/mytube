import type { ChangeEvent, KeyboardEvent } from "react";
import { Search, X } from "lucide-react";

const ICON_SM = "h-4 w-4" as const;

interface HeaderSearchMobileProps {
	searchPlaceholder: string;
	searchQuery: string;
	visible: boolean;
	onSearchChange: (value: string) => void;
	onClear: () => void;
	onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export const HeaderSearchMobile = ({
	searchPlaceholder,
	searchQuery,
	visible,
	onSearchChange,
	onClear,
	onKeyDown,
}: HeaderSearchMobileProps) => {
	if (!visible) return null;

	return (
		<div className="mobile-header-search pb-3 xl:hidden">
			<div className="relative">
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
				<button
					onClick={onClear}
					className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-ios-700 dark:hover:text-ios-200"
					title="Clear search"
				>
					<X className={ICON_SM} />
				</button>
			</div>
		</div>
	);
};
