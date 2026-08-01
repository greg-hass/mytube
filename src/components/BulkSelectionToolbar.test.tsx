import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkSelectionToolbar } from "./BulkSelectionToolbar";

describe("BulkSelectionToolbar", () => {
	it("shows the selected count and only enables relevant actions", () => {
		render(
			<BulkSelectionToolbar
				selectedVideoCount={0}
				selectedChannelCount={2}
				addToFavoritesCount={1}
				removeFromFavoritesCount={0}
				onMarkWatched={vi.fn()}
				onMarkUnwatched={vi.fn()}
				onAddToFavorites={vi.fn()}
				onRemoveFromFavorites={vi.fn()}
				onClear={vi.fn()}
			/>,
		);

		expect(screen.getByText("2 selected")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Mark watched" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Add to Favourites" })).toBeEnabled();
		expect(
			screen.getByRole("button", { name: "Remove from Favourites" }),
		).toBeDisabled();
	});

	it("calls the selected bulk action and clear handlers", () => {
		const onMarkWatched = vi.fn();
		const onClear = vi.fn();

		render(
			<BulkSelectionToolbar
				selectedVideoCount={1}
				selectedChannelCount={0}
				addToFavoritesCount={0}
				removeFromFavoritesCount={1}
				onMarkWatched={onMarkWatched}
				onMarkUnwatched={vi.fn()}
				onAddToFavorites={vi.fn()}
				onRemoveFromFavorites={vi.fn()}
				onClear={onClear}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Mark watched" }));
		fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));

		expect(onMarkWatched).toHaveBeenCalledOnce();
		expect(onClear).toHaveBeenCalledOnce();
	});

	it("assigns selected channels to a group or clears their group", async () => {
		const onAssignChannelsToGroup = vi.fn();

		render(
			<BulkSelectionToolbar
				selectedVideoCount={0}
				selectedChannelCount={2}
				groupOptions={["Tech"]}
				addToFavoritesCount={0}
				removeFromFavoritesCount={0}
				onMarkWatched={vi.fn()}
				onMarkUnwatched={vi.fn()}
				onAddToFavorites={vi.fn()}
				onRemoveFromFavorites={vi.fn()}
				onAssignChannelsToGroup={onAssignChannelsToGroup}
				onClear={vi.fn()}
			/>,
		);

		const groupSelect = screen.getByRole("combobox", {
			name: "Assign selected channels to group",
		});
		fireEvent.change(groupSelect, { target: { value: "Tech" } });
		await waitFor(() => expect(groupSelect).not.toBeDisabled());
		fireEvent.change(groupSelect, { target: { value: "__ungrouped__" } });

		expect(onAssignChannelsToGroup).toHaveBeenNthCalledWith(1, "Tech");
		expect(onAssignChannelsToGroup).toHaveBeenNthCalledWith(2, "");
	});
});
