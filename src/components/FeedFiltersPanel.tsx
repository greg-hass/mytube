import { Filter, X } from "lucide-react";
import { useRef } from "react";
import type { DurationFilter } from "../lib/video-feed-index";
import { useModalFocus } from "../hooks/useModalFocus";

type FeedFiltersPanelProps = {
	durationFilter: DurationFilter;
	onDurationFilterChange: (value: DurationFilter) => void;
	hideLiveReplays: boolean;
	onToggleLiveReplays: () => void;
	hidePremieres: boolean;
	onTogglePremieres: () => void;
	hideDuplicateTitles: boolean;
	onToggleDuplicateTitles: () => void;
	mutedKeywordText: string;
	onMutedKeywordTextChange: (value: string) => void;
	boostedKeywordText: string;
	onBoostedKeywordTextChange: (value: string) => void;
	activeFilterCount: number;
	onClear: () => void;
	onClose: () => void;
};

const INPUT_CLASS =
	"mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-red-500 dark:border-ios-800 dark:bg-ios-950 dark:text-ios-100 dark:placeholder:text-ios-500";

function FilterToggle({
	label,
	hint,
	checked,
	onChange,
}: {
	label: string;
	hint: string;
	checked: boolean;
	onChange: () => void;
}) {
	return (
		<label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200/80 bg-white px-3 py-2.5 transition-colors hover:border-gray-300 dark:border-ios-800/80 dark:bg-ios-950/60 dark:hover:border-ios-700">
			<input
				type="checkbox"
				aria-label={label}
				checked={checked}
				onChange={onChange}
				className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
			/>
			<span className="min-w-0">
				<span className="block text-sm font-medium text-gray-900 dark:text-ios-100">
					{label}
				</span>
				<span className="mt-0.5 block text-xs text-gray-500 dark:text-ios-400">
					{hint}
				</span>
			</span>
		</label>
	);
}

export function FeedFiltersPanel({
	durationFilter,
	onDurationFilterChange,
	hideLiveReplays,
	onToggleLiveReplays,
	hidePremieres,
	onTogglePremieres,
	hideDuplicateTitles,
	onToggleDuplicateTitles,
	mutedKeywordText,
	onMutedKeywordTextChange,
	boostedKeywordText,
	onBoostedKeywordTextChange,
	activeFilterCount,
	onClear,
	onClose,
}: FeedFiltersPanelProps) {
	const durationRef = useRef<HTMLSelectElement>(null);
	const { modalRef, onKeyDown } = useModalFocus<HTMLElement>({
		isOpen: true,
		onClose,
		initialFocusRef: durationRef,
		trapFocus: false,
	});

	return (
		<section
			ref={modalRef}
			id="feed-filters-panel"
			data-testid="feed-filters-panel"
			role="region"
			aria-label="Feed filters"
			onKeyDown={onKeyDown}
			className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 shadow-sm dark:border-ios-800 dark:bg-ios-900/80 sm:p-4"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-start gap-2">
					<Filter className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
					<div>
						<h2 className="text-sm font-semibold text-gray-900 dark:text-ios-100">
							Advanced feed filters
						</h2>
						<p className="mt-0.5 text-xs text-gray-500 dark:text-ios-400">
							Latest stays chronological; keyword boosting is an explicit choice.
						</p>
					</div>
				</div>
				<button
					type="button"
					aria-label="Close filters"
					onClick={onClose}
					className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900 dark:text-ios-400 dark:hover:bg-ios-800 dark:hover:text-ios-100"
				>
					<X className="h-4 w-4" aria-hidden="true" />
				</button>
			</div>

			<div className="mt-4 grid gap-3 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)]">
				<div>
					<label
						htmlFor="feed-duration-filter"
						className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-ios-400"
					>
						Duration
					</label>
					<select
						ref={durationRef}
						id="feed-duration-filter"
						aria-label="Video duration"
						value={durationFilter}
						onChange={(event) =>
							onDurationFilterChange(event.target.value as DurationFilter)
						}
						className={INPUT_CLASS}
					>
						<option value="any">Any length</option>
						<option value="under-10">Under 10 minutes</option>
						<option value="10-30">10–30 minutes</option>
						<option value="30-plus">30+ minutes</option>
					</select>
				</div>

				<div className="grid gap-2 sm:grid-cols-3">
					<FilterToggle
						label="Hide live replays"
						hint="Filter stream replays and watchalongs"
						checked={hideLiveReplays}
						onChange={onToggleLiveReplays}
					/>
					<FilterToggle
						label="Hide premieres"
						hint="Filter premiere announcements"
						checked={hidePremieres}
						onChange={onTogglePremieres}
					/>
					<FilterToggle
						label="Hide duplicates"
						hint="Keep the newest copy of a title"
						checked={hideDuplicateTitles}
						onChange={onToggleDuplicateTitles}
					/>
				</div>
			</div>

			<div className="mt-3 grid gap-3 sm:grid-cols-2">
				<div>
					<label
						htmlFor="feed-muted-keywords"
						className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-ios-400"
					>
						Mute keywords
					</label>
					<input
						id="feed-muted-keywords"
						type="text"
						value={mutedKeywordText}
						onChange={(event) => onMutedKeywordTextChange(event.target.value)}
						placeholder="e.g. trailer, recap"
						className={INPUT_CLASS}
					/>
					<p className="mt-1 text-xs text-gray-500 dark:text-ios-400">
						Comma-separated words to exclude.
					</p>
				</div>
				<div>
					<label
						htmlFor="feed-boosted-keywords"
						className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-ios-400"
					>
						Boost keywords
					</label>
					<input
						id="feed-boosted-keywords"
						type="text"
						value={boostedKeywordText}
						onChange={(event) => onBoostedKeywordTextChange(event.target.value)}
						placeholder="e.g. interview, science"
						className={INPUT_CLASS}
					/>
					<p className="mt-1 text-xs text-gray-500 dark:text-ios-400">
						Comma-separated words to bring forward within Latest.
					</p>
				</div>
			</div>

			<div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200/80 pt-3 dark:border-ios-800/80">
				<p className="text-xs text-gray-500 dark:text-ios-400">
					{activeFilterCount === 0
						? "No advanced filters active"
						: `${activeFilterCount} advanced filter${activeFilterCount === 1 ? "" : "s"} active`}
				</p>
				<button
					type="button"
					onClick={onClear}
					disabled={activeFilterCount === 0}
					className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/30"
				>
					Clear advanced filters
				</button>
			</div>
		</section>
	);
}
