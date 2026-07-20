import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CompactSubscriptionsList } from "./CompactSubscriptionsList";
import {
	getSubscriptionSection,
	groupCompactSubscriptions,
} from "./compact-subscriptions";

describe("compact subscriptions", () => {
	it("groups letters alphabetically and puts non-letters under #", () => {
		expect(getSubscriptionSection("  apple")).toBe("A");
		expect(getSubscriptionSection("2 Minute Papers")).toBe("#");
		expect(
			groupCompactSubscriptions([
				{ id: "2", title: "Beta", description: "", thumbnail: "" },
				{ id: "1", title: "Alpha", description: "", thumbnail: "" },
				{ id: "3", title: "2 Minute Papers", description: "", thumbnail: "" },
			]).map(([section]) => section),
		).toEqual(["A", "B", "#"]);
	});

	it("renders compact controls and forwards actions", () => {
		const onRemove = vi.fn();
		const onToggleFavorite = vi.fn();
		const onToggleMute = vi.fn();
		render(
			<MemoryRouter>
				<CompactSubscriptionsList
					channels={[
						{
							id: "UC_TEST",
							title: "Alpha",
							description: "",
							thumbnail: "",
							isFavorite: true,
							isMuted: false,
						},
					]}
					onRemove={onRemove}
					onToggleFavorite={onToggleFavorite}
					onToggleMute={onToggleMute}
				/>
			</MemoryRouter>,
		);

		const favorite = screen.getByRole("button", {
			name: "Remove Alpha from favorite channels",
		});
		expect(favorite).toHaveAttribute("aria-pressed", "true");
		fireEvent.click(favorite);
		fireEvent.click(screen.getByRole("button", { name: "Mute Alpha" }));

		// Unsubscribe requires a confirm step before onRemove fires
		fireEvent.click(
			screen.getByRole("button", { name: "Unsubscribe from Alpha" }),
		);
		expect(onRemove).not.toHaveBeenCalled();
		fireEvent.click(
			screen.getByRole("button", { name: "Confirm unsubscribe from Alpha" }),
		);

		expect(onToggleFavorite).toHaveBeenCalledWith("UC_TEST");
		expect(onToggleMute).toHaveBeenCalledWith("UC_TEST");
		expect(onRemove).toHaveBeenCalledWith("UC_TEST");
	});

	it("cancelling the unsubscribe confirm keeps the channel", () => {
		const onRemove = vi.fn();
		render(
			<MemoryRouter>
				<CompactSubscriptionsList
					channels={[
						{ id: "UC_TEST", title: "Alpha", description: "", thumbnail: "" },
					]}
					onRemove={onRemove}
					onToggleFavorite={vi.fn()}
					onToggleMute={vi.fn()}
				/>
			</MemoryRouter>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Unsubscribe from Alpha" }),
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Cancel unsubscribe from Alpha" }),
		);

		expect(onRemove).not.toHaveBeenCalled();
		expect(
			screen.getByRole("button", { name: "Unsubscribe from Alpha" }),
		).toBeInTheDocument();
	});

	it("shows the channel @handle under the title when available", () => {
		render(
			<MemoryRouter>
				<CompactSubscriptionsList
					channels={[
						{
							id: "UC_TEST",
							title: "Alpha",
							description: "",
							thumbnail: "",
							customUrl: "@alphachannel",
						},
						{
							id: "UC_OTHER",
							title: "Beta",
							description: "",
							thumbnail: "",
							customUrl: "beta",
						},
					]}
					onRemove={vi.fn()}
					onToggleFavorite={vi.fn()}
					onToggleMute={vi.fn()}
				/>
			</MemoryRouter>,
		);

		expect(screen.getByText("@alphachannel")).toBeInTheDocument();
		expect(screen.getByText("@beta")).toBeInTheDocument();
	});

	it("shows a jump rail only for a sufficiently large list", () => {
		const channels = Array.from({ length: 12 }, (_, index) => ({
			id: `UC_${index}`,
			title: `${String.fromCharCode(65 + (index % 4))} channel ${index}`,
			description: "",
			thumbnail: "",
		}));
		render(
			<MemoryRouter>
				<CompactSubscriptionsList
					channels={channels}
					onRemove={vi.fn()}
					onToggleFavorite={vi.fn()}
					onToggleMute={vi.fn()}
				/>
			</MemoryRouter>,
		);
		expect(
			screen.getByRole("navigation", { name: "Jump to channel letter" }),
		).toBeInTheDocument();
	});
});
