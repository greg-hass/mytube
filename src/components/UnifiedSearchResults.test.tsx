import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnifiedSearchResults } from "./UnifiedSearchResults";
import type { UnifiedSearchResults as SearchResults } from "../lib/unified-search";

vi.mock("./SubscriptionCard", () => ({
	SubscriptionCard: ({
		channel,
		selectable,
		selected,
		onToggleSelect,
	}: {
		channel: { id: string; title: string };
		selectable?: boolean;
		selected?: boolean;
		onToggleSelect?: (channelId: string) => void;
	}) => (
		<article data-testid="search-channel">
			{selectable && onToggleSelect && (
				<input
					type="checkbox"
					checked={selected}
					onChange={() => onToggleSelect(channel.id)}
					aria-label={`Select ${channel.title}`}
				/>
			)}
			{channel.title}
		</article>
	),
}));

vi.mock("./VirtualizedVideoGrid", () => ({
	VirtualizedVideoGrid: ({
		videos,
	}: {
		videos: Array<{ id: string; title: string }>;
	}) => (
		<section data-testid="search-video-grid">
			{videos.map((video) => (
				<article key={video.title}>
					{video.title}
				</article>
			))}
		</section>
	),
}));

beforeEach(() => {
	localStorage.clear();
});

const results: SearchResults = {
	allChannels: [
		{
			id: "UC_CHANNEL",
			title: "Tech Channel",
			description: "",
			thumbnail: "",
		},
	],
	allVideos: [
		{
			id: "video-1",
			title: "Tech upload",
			description: "",
			thumbnail: "",
			channelId: "UC_CHANNEL",
			channelTitle: "Tech Channel",
			publishedAt: "2026-08-01T00:00:00.000Z",
		},
	],
	favoriteChannels: [
		{
			id: "UC_FAVORITE",
			title: "Favourite Channel",
			description: "",
			thumbnail: "",
			isFavorite: true,
		},
	],
	favoriteVideos: [
		{
			id: "favorite-video",
			title: "Favourite upload",
			description: "",
			thumbnail: "",
			channelId: "UC_FAVORITE",
			channelTitle: "Favourite Channel",
			publishedAt: "2026-07-31T00:00:00.000Z",
		},
	],
};

describe("UnifiedSearchResults", () => {
	it("shows deterministic channel and video sections for All", () => {
		render(
			<UnifiedSearchResults
				query="tech"
				scope="all"
				results={results}
				onScopeChange={vi.fn()}
				onToggleChannelFavorite={vi.fn().mockResolvedValue(undefined)}
				channelThumbnails={new Map()}
			/>,
		);

		expect(screen.getByTestId("unified-search-results")).toBeInTheDocument();
		expect(screen.getByText("Tech Channel")).toBeInTheDocument();
		expect(screen.getByText("Tech upload")).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "All (2)" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(screen.getByRole("tab", { name: "Favourites (2)" })).toBeInTheDocument();
	});

	it("reports and switches to the Favourites corpus", () => {
		const onScopeChange = vi.fn();
		const view = render(
			<UnifiedSearchResults
				query="favourite"
				scope="all"
				results={results}
				onScopeChange={onScopeChange}
				onToggleChannelFavorite={vi.fn().mockResolvedValue(undefined)}
				channelThumbnails={new Map()}
			/>,
		);

		fireEvent.click(screen.getByRole("tab", { name: "Favourites (2)" }));
		expect(onScopeChange).toHaveBeenCalledWith("favorites");

		view.rerender(
			<UnifiedSearchResults
				query="favourite"
				scope="favorites"
				results={results}
				onScopeChange={onScopeChange}
				onToggleChannelFavorite={vi.fn().mockResolvedValue(undefined)}
				channelThumbnails={new Map()}
			/>,
		);
		expect(screen.getByText("Favourite Channel")).toBeInTheDocument();
		expect(screen.getByText("Favourite upload")).toBeInTheDocument();
		expect(screen.queryByText("Tech upload")).not.toBeInTheDocument();
	});

	it("shows a clear empty state when the selected scope has no matches", () => {
		render(
			<UnifiedSearchResults
				query="missing"
				scope="videos"
				results={{
					...results,
					allVideos: [],
				}}
				onScopeChange={vi.fn()}
				onToggleChannelFavorite={vi.fn().mockResolvedValue(undefined)}
				channelThumbnails={new Map()}
			/>,
		);

		expect(screen.getByText("No matches found")).toBeInTheDocument();
		expect(
			screen.getByText(/choose a different search scope/i),
		).toBeInTheDocument();
	});

	it("keeps channel bulk actions while video results have no selection controls", async () => {
		const onToggleChannelFavorite = vi.fn().mockResolvedValue(undefined);
		render(
			<UnifiedSearchResults
				query="tech"
				scope="all"
				results={results}
				onScopeChange={vi.fn()}
				onToggleChannelFavorite={onToggleChannelFavorite}
				channelThumbnails={new Map()}
			/>,
		);

		fireEvent.click(screen.getByRole("checkbox", { name: "Select Tech Channel" }));
		expect(screen.getByText("1 selected")).toBeInTheDocument();
		expect(
			screen.queryByRole("checkbox", { name: "Select Tech upload" }),
		).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Mark watched" })).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Add to Favourites" }));

		expect(onToggleChannelFavorite).toHaveBeenCalledWith("UC_CHANNEL");

		await waitFor(() => {
			expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
		});
	});
});
