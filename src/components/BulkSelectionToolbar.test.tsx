import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkSelectionToolbar } from "./BulkSelectionToolbar";

describe("BulkSelectionToolbar", () => {
	it("shows the selected count and only enables relevant actions", () => {
		render(
			<BulkSelectionToolbar
				selectedChannelCount={2}
				addToFavoritesCount={1}
				removeFromFavoritesCount={0}
				onAddToFavorites={vi.fn()}
				onRemoveFromFavorites={vi.fn()}
				onClear={vi.fn()}
			/>,
		);

		expect(screen.getByText("2 selected")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Mark watched" })).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Add to Favourites" })).toBeEnabled();
		expect(
			screen.getByRole("button", { name: "Remove from Favourites" }),
		).toBeDisabled();
	});

	it("calls the selected bulk action and clear handlers", () => {
		const onRemoveFromFavorites = vi.fn();
		const onClear = vi.fn();

		render(
			<BulkSelectionToolbar
				selectedChannelCount={1}
				addToFavoritesCount={0}
				removeFromFavoritesCount={1}
				onAddToFavorites={vi.fn()}
				onRemoveFromFavorites={onRemoveFromFavorites}
				onClear={onClear}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Remove from Favourites" }));
		fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));

		expect(onRemoveFromFavorites).toHaveBeenCalledOnce();
		expect(onClear).toHaveBeenCalledOnce();
	});

	it("assigns selected channels to a group or clears their group", async () => {
		const onAssignChannelsToGroup = vi.fn();

		render(
			<BulkSelectionToolbar
				selectedChannelCount={2}
				groupOptions={["Tech"]}
				addToFavoritesCount={0}
				removeFromFavoritesCount={0}
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
