import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeedFiltersPanel } from "./FeedFiltersPanel";

const createProps = () => ({
	durationFilter: "any" as const,
	onDurationFilterChange: vi.fn(),
	hideLiveReplays: false,
	onToggleLiveReplays: vi.fn(),
	hidePremieres: false,
	onTogglePremieres: vi.fn(),
	hideDuplicateTitles: false,
	onToggleDuplicateTitles: vi.fn(),
	mutedKeywordText: "",
	onMutedKeywordTextChange: vi.fn(),
	boostedKeywordText: "",
	onBoostedKeywordTextChange: vi.fn(),
	activeFilterCount: 0,
	onClear: vi.fn(),
	onClose: vi.fn(),
});

describe("FeedFiltersPanel", () => {
	it("exposes the existing advanced filter controls", () => {
		const props = createProps();
		render(<FeedFiltersPanel {...props} />);

		fireEvent.change(screen.getByLabelText("Video duration"), {
			target: { value: "30-plus" },
		});
		fireEvent.click(screen.getByRole("checkbox", { name: "Hide live replays" }));
		fireEvent.click(screen.getByRole("checkbox", { name: "Hide premieres" }));
		fireEvent.click(screen.getByRole("checkbox", { name: "Hide duplicates" }));
		fireEvent.change(screen.getByLabelText("Mute keywords"), {
			target: { value: "trailer, recap" },
		});
		fireEvent.change(screen.getByLabelText("Boost keywords"), {
			target: { value: "interview" },
		});

		expect(props.onDurationFilterChange).toHaveBeenCalledWith("30-plus");
		expect(props.onToggleLiveReplays).toHaveBeenCalledTimes(1);
		expect(props.onTogglePremieres).toHaveBeenCalledTimes(1);
		expect(props.onToggleDuplicateTitles).toHaveBeenCalledTimes(1);
		expect(props.onMutedKeywordTextChange).toHaveBeenCalledWith("trailer, recap");
		expect(props.onBoostedKeywordTextChange).toHaveBeenCalledWith("interview");
	});

	it("clears active filters and closes on request", () => {
		const props = { ...createProps(), activeFilterCount: 2 };
		render(<FeedFiltersPanel {...props} />);

		fireEvent.click(screen.getByRole("button", { name: "Clear advanced filters" }));
		fireEvent.click(screen.getByRole("button", { name: "Close filters" }));

		expect(props.onClear).toHaveBeenCalledTimes(1);
		expect(props.onClose).toHaveBeenCalledTimes(1);
		expect(screen.getByText("2 advanced filters active")).toBeInTheDocument();
	});

	it("disables clear when no advanced filters are active", () => {
		const props = createProps();
		render(<FeedFiltersPanel {...props} />);

		expect(
			screen.getByRole("button", { name: "Clear advanced filters" }),
		).toBeDisabled();
	});

	it("focuses the first filter, closes on Escape, and restores its opener", () => {
		const props = createProps();
		const { rerender } = render(
			<button type="button">Open Filters</button>,
		);
		const opener = screen.getByRole("button", { name: "Open Filters" });
		opener.focus();

		rerender(
			<>
				<button type="button">Open Filters</button>
				<FeedFiltersPanel {...props} />
			</>,
		);

		const duration = screen.getByRole("combobox", { name: "Video duration" });
		expect(duration).toHaveFocus();

		fireEvent.keyDown(duration, { key: "Escape" });
		expect(props.onClose).toHaveBeenCalledOnce();

		rerender(<button type="button">Open Filters</button>);
		expect(opener).toHaveFocus();
	});
});
