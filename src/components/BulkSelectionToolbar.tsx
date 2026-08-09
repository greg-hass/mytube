import { Heart, Trash2, X } from "lucide-react";
import { useState } from "react";

type MaybePromise = void | Promise<void>;

type Props = {
	selectedChannelCount: number;
	groupOptions?: string[];
	showFavoriteActions?: boolean;
	showMuteActions?: boolean;
	showUnsubscribeAction?: boolean;
	addToFavoritesCount: number;
	removeFromFavoritesCount: number;
	muteChannelsCount?: number;
	unmuteChannelsCount?: number;
	onAddToFavorites: () => MaybePromise;
	onRemoveFromFavorites: () => MaybePromise;
	onMuteChannels?: () => MaybePromise;
	onUnmuteChannels?: () => MaybePromise;
	onUnsubscribeChannels?: () => MaybePromise;
	onAssignChannelsToGroup?: (group: string) => MaybePromise;
	onClear: () => void;
};

const UNGROUPED_VALUE = "__ungrouped__";

export function BulkSelectionToolbar({
	selectedChannelCount,
	groupOptions = [],
	showFavoriteActions = true,
	showMuteActions = false,
	showUnsubscribeAction = false,
	addToFavoritesCount,
	removeFromFavoritesCount,
	muteChannelsCount = 0,
	unmuteChannelsCount = 0,
	onAddToFavorites,
	onRemoveFromFavorites,
	onMuteChannels,
	onUnmuteChannels,
	onUnsubscribeChannels,
	onAssignChannelsToGroup,
	onClear,
}: Props) {
	const [groupAssignmentValue, setGroupAssignmentValue] = useState("");
	const [isAssigningGroup, setIsAssigningGroup] = useState(false);
	const selectedCount = selectedChannelCount;
	if (selectedCount === 0) return null;

	return (
		<div
			data-testid="bulk-selection-toolbar"
			role="region"
			aria-label="Bulk actions"
			className="sticky top-2 z-20 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/95 p-3 shadow-lg backdrop-blur dark:border-red-900/60 dark:bg-red-950/90 sm:flex-row sm:items-center sm:justify-between"
		>
			<div className="flex items-center justify-between gap-3 sm:justify-start">
				<p className="text-sm font-semibold text-red-900 dark:text-red-100">
					{selectedCount} selected
				</p>
				<button
					type="button"
					aria-label="Clear selection"
					onClick={onClear}
					className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-red-700 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900/50"
				>
					<X className="h-4 w-4" aria-hidden="true" />
					Clear
				</button>
			</div>
			<div className="flex flex-wrap gap-2">
				{showFavoriteActions && <>
				<button
					type="button"
					disabled={addToFavoritesCount === 0}
					onClick={() => void onAddToFavorites()}
					className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-ios-900 dark:text-ios-100 dark:ring-ios-700 dark:hover:bg-ios-800"
				>
					<Heart className="h-4 w-4" aria-hidden="true" />
					Add to Favourites
				</button>
				<button
					type="button"
					disabled={removeFromFavoritesCount === 0}
					onClick={() => void onRemoveFromFavorites()}
					className="inline-flex h-9 items-center rounded-lg bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-ios-900 dark:text-ios-100 dark:ring-ios-700 dark:hover:bg-ios-800"
				>
					Remove from Favourites
				</button>
				</>}
				{showMuteActions && onMuteChannels && onUnmuteChannels && <>
				<button
					type="button"
					disabled={muteChannelsCount === 0}
					onClick={() => void onMuteChannels()}
					className="inline-flex h-9 items-center rounded-lg bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-ios-900 dark:text-ios-100 dark:ring-ios-700 dark:hover:bg-ios-800"
				>
					Mute selected
				</button>
				<button
					type="button"
					disabled={unmuteChannelsCount === 0}
					onClick={() => void onUnmuteChannels()}
					className="inline-flex h-9 items-center rounded-lg bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-ios-900 dark:text-ios-100 dark:ring-ios-700 dark:hover:bg-ios-800"
				>
					Unmute selected
				</button>
				</>}
				{showUnsubscribeAction && onUnsubscribeChannels && selectedChannelCount > 0 && (
					<button
						type="button"
						onClick={() => void onUnsubscribeChannels()}
						className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-red-700 shadow-sm ring-1 ring-red-200 hover:bg-red-50 dark:bg-ios-900 dark:text-red-300 dark:ring-red-900/60 dark:hover:bg-red-950/30"
					>
						<Trash2 className="h-4 w-4" aria-hidden="true" />
						Unsubscribe selected
					</button>
				)}
				{selectedChannelCount > 0 && onAssignChannelsToGroup && (
					<select
						aria-label="Assign selected channels to group"
						value={groupAssignmentValue}
						disabled={isAssigningGroup}
						onChange={(event) => {
							const value = event.target.value;
							if (!value) return;
							setGroupAssignmentValue(value);
							setIsAssigningGroup(true);
							void Promise.resolve(
								onAssignChannelsToGroup(
									value === UNGROUPED_VALUE ? "" : value,
								),
							)
								.catch(() => undefined)
								.finally(() => {
									setGroupAssignmentValue("");
									setIsAssigningGroup(false);
								});
						}}
						className="inline-flex h-9 min-w-40 items-center rounded-lg bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60 dark:bg-ios-900 dark:text-ios-100 dark:ring-ios-700 dark:hover:bg-ios-800"
					>
						<option value="" disabled>
							{isAssigningGroup ? "Assigning..." : "Assign to group..."}
						</option>
						<option value={UNGROUPED_VALUE}>Ungrouped</option>
						{groupOptions.map((group) => (
							<option key={group} value={group}>
								{group}
							</option>
						))}
					</select>
				)}
			</div>
		</div>
	);
}
