import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AddChannelModal } from "./AddChannelModal";

vi.mock("framer-motion", () => ({
	AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
	motion: {
		div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
		span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
		section: ({ children, ...props }: any) => (
			<section {...props}>{children}</section>
		),
	},
}));

vi.mock("../lib/youtube-api", () => ({
	fetchChannelInfoWithFallback: vi.fn(() => Promise.resolve(null)),
}));

const VIDEO_CHANNEL = {
	id: "UCvideochannel99999999999",
	title: "Video Channel",
	description: "Found via video search",
	thumbnail: "https://example.com/video-channel.jpg",
};

const VIDEO_RESULT = {
	id: "vid42",
	title: "Sourdough starter guide",
	channelId: VIDEO_CHANNEL.id,
	channelTitle: "Video Channel",
	publishedAt: "2026-08-17T00:00:00.000Z",
	publishedText: "2 days ago",
	duration: 631,
	thumbnail: "https://example.com/video.jpg",
	description: "Baking",
	isShort: false,
};

function installVideoSearchFetchMock() {
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string | URL | Request, init?: RequestInit) => {
			const requestUrl = String(url);
			if (requestUrl === "/api/video-search") {
				const body = JSON.parse(String(init?.body || "{}")) as {
					query?: string;
				};
				const results =
					(body.query || "").trim().length >= 2 &&
					(body.query || "").includes("sourdough")
						? [VIDEO_RESULT]
						: [];
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ results, source: "scrape" }),
				});
			}
			if (requestUrl.startsWith("/api/channel-search")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ results: [VIDEO_CHANNEL] }),
				});
			}
			return Promise.resolve({ ok: false, status: 404 });
		}),
	);
}

function typeQuery(query: string) {
	fireEvent.change(screen.getByLabelText("YouTube Channel"), {
		target: { value: query },
	});
}

function switchToVideosMode() {
	fireEvent.click(screen.getByTestId("search-mode-videos"));
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("AddChannelModal — video search mode", () => {
	it("hides the mode toggle until the input has 2+ characters", () => {
		installVideoSearchFetchMock();
		render(<AddChannelModal isOpen onClose={vi.fn()} onAdd={vi.fn()} />);

		expect(screen.queryByTestId("search-mode-videos")).not.toBeInTheDocument();

		typeQuery("s");
		expect(screen.queryByTestId("search-mode-videos")).not.toBeInTheDocument();

		typeQuery("sourdough");
		expect(screen.getByTestId("search-mode-videos")).toBeInTheDocument();
	});

	it("searches latest videos when submitting in videos mode", async () => {
		installVideoSearchFetchMock();
		render(<AddChannelModal isOpen onClose={vi.fn()} onAdd={vi.fn()} />);

		typeQuery("sourdough");
		switchToVideosMode();
		fireEvent.click(screen.getByRole("button", { name: "Search channels" }));

		await waitFor(() => {
			expect(screen.getByTestId("video-search-results")).toBeInTheDocument();
		});
		expect(screen.getByText("Sourdough starter guide")).toBeInTheDocument();
		expect(screen.getByText("Video Channel")).toBeInTheDocument();
		expect(screen.getByText(/2 days ago/)).toBeInTheDocument();
		expect(screen.getByText(/10:31/)).toBeInTheDocument();
	});

	it("runs the video search when switching modes with a query already typed", async () => {
		installVideoSearchFetchMock();
		render(<AddChannelModal isOpen onClose={vi.fn()} onAdd={vi.fn()} />);

		typeQuery("sourdough");
		switchToVideosMode();

		await waitFor(() => {
			expect(screen.getByTestId("video-search-results")).toBeInTheDocument();
		});
	});

	it("resolves the channel and previews it when a video is clicked", async () => {
		installVideoSearchFetchMock();
		const onAdd = vi.fn();
		render(<AddChannelModal isOpen onClose={vi.fn()} onAdd={onAdd} />);

		typeQuery("sourdough");
		switchToVideosMode();
		await waitFor(() => {
			expect(
				screen.getByTestId(`video-result-${VIDEO_RESULT.id}`),
			).toBeInTheDocument();
		});

		fireEvent.click(screen.getByTestId(`video-result-${VIDEO_RESULT.id}`));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith(
				`/api/channel-search?q=${VIDEO_CHANNEL.id}`,
				expect.anything(),
			);
		});
		await waitFor(() => {
			expect(screen.getByText("Channel Preview")).toBeInTheDocument();
		});
		expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
	});

	it("shows an empty state when no videos match", async () => {
		installVideoSearchFetchMock();
		render(<AddChannelModal isOpen onClose={vi.fn()} onAdd={vi.fn()} />);

		typeQuery("zz");
		switchToVideosMode();
		fireEvent.click(screen.getByRole("button", { name: "Search channels" }));

		await waitFor(() => {
			expect(screen.getByTestId("video-search-results")).toBeInTheDocument();
		});
		expect(
			screen.getByText(/No recent videos found with "zz" in the title/),
		).toBeInTheDocument();
	});
});
