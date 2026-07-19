import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useRSSVideos } from "./useRSSVideos";

vi.mock("sonner", () => ({
	toast: {
		loading: vi.fn(),
		success: vi.fn(),
		error: vi.fn(),
		dismiss: vi.fn(),
	},
}));

const createWrapper = () => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
};

// ── Shared mock builders ────────────────────────────────────

function statusResponse(overrides: Record<string, unknown> = {}) {
	return new Response(
		JSON.stringify({
			state: "idle",
			current: 1,
			total: 1,
			videos: 1,
			errors: 0,
			startedAt: null,
			completedAt: null,
			lastUpdated: "2026-05-06T20:00:00.000Z",
			...overrides,
		}),
	);
}

function videosResponse(
	videos: unknown[],
	lastUpdated: string,
	totalChannels = 1,
) {
	return new Response(
		JSON.stringify({
			videos,
			lastUpdated,
			totalChannels,
			totalVideos: videos.length,
		}),
	);
}

function video(title: string, id: string, publishedAt: string) {
	return {
		id,
		title,
		description: "",
		thumbnail: "",
		channelId: "UC123",
		channelTitle: "Test Channel",
		publishedAt,
	};
}

// ── Test suite ──────────────────────────────────────────────

describe("useRSSVideos", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("keeps manual refresh quiet and leaves cached videos visible", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith("/api/videos/status")) return statusResponse();
			if (url === "/api/videos" || url.startsWith("/api/videos?"))
				return videosResponse(
					[video("Cached video", "video-1", "2026-05-06T20:00:00.000Z")],
					"2026-05-06T20:00:00.000Z",
				);
			if (url === "/api/videos/refresh")
				return new Response(JSON.stringify({ success: true }));
			throw new Error(`Unexpected fetch ${url}`);
		});

		vi.stubGlobal("fetch", fetchMock);

		const { result } = renderHook(() => useRSSVideos(), {
			wrapper: createWrapper(),
		});

		await waitFor(() => {
			expect(result.current.videos).toHaveLength(1);
		});

		result.current.refresh();

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith("/api/videos/refresh", {
				method: "POST",
				cache: "no-store",
				credentials: "same-origin",
			});
		});

		expect(result.current.videos[0].title).toBe("Cached video");
		expect(toast.loading).not.toHaveBeenCalled();
		expect(toast.success).toHaveBeenCalledWith(
			"Feed refresh started — pulling new videos...",
		);
	});

	it("tracks a manual refresh operation through progress and completion", async () => {
		let statusCalls = 0;
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith("/api/videos/status")) {
				statusCalls += 1;
				if (statusCalls <= 1) {
					return statusResponse({ state: "idle" });
				}
				if (statusCalls === 2) {
					return statusResponse({
						state: "running",
						current: 1,
						total: 2,
						lastUpdated: "2026-05-06T20:00:00.000Z",
					});
				}
				return statusResponse({
					state: "idle",
					current: 2,
					total: 2,
					lastUpdated: "2026-05-06T20:01:00.000Z",
				});
			}
			if (url === "/api/videos" || url.startsWith("/api/videos?")) {
				return videosResponse(
					[video("Cached video", "video-1", "2026-05-06T20:00:00.000Z")],
					"2026-05-06T20:00:00.000Z",
				);
			}
			if (url === "/api/videos/refresh") {
				return new Response(JSON.stringify({ success: true }));
			}
			throw new Error(`Unexpected fetch ${url}`);
		});

		vi.stubGlobal("fetch", fetchMock);

		const { result } = renderHook(() => useRSSVideos(), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.videos).toHaveLength(1));
		act(() => result.current.refresh());

		await waitFor(() => {
			expect(result.current.refreshPhase).toBe("refreshing");
			expect(result.current.refreshProgress).toBe(50);
		});

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 2200));
		});

		await waitFor(() => expect(result.current.refreshPhase).toBe("done"));
		expect(toast.success).toHaveBeenCalledWith("Feed refresh complete");
	});

	it("refetches videos when server status reports a newer completed cache", async () => {
		let statusCalls = 0;
		let videoCalls = 0;

		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);

			if (url.startsWith("/api/videos/status")) {
				statusCalls += 1;
				const isFirstCall = statusCalls <= 1;
				return statusResponse({
					state: isFirstCall ? "running" : "idle",
					startedAt: isFirstCall ? "2026-05-09T10:00:00.000Z" : null,
					completedAt: isFirstCall ? null : "2026-05-09T10:15:00.000Z",
					lastUpdated: isFirstCall
						? "2026-05-09T10:00:00.000Z"
						: "2026-05-09T10:15:00.000Z",
				});
			}

			if (url === "/api/videos" || url.startsWith("/api/videos?")) {
				videoCalls += 1;
				const isFresh = videoCalls > 1;
				return videosResponse(
					[
						video(
							isFresh ? "Fresh scheduled video" : "Old cached video",
							isFresh ? "fresh-video" : "old-video",
							isFresh ? "2026-05-09T10:15:00.000Z" : "2026-05-09T10:00:00.000Z",
						),
					],
					isFresh ? "2026-05-09T10:15:00.000Z" : "2026-05-09T10:00:00.000Z",
				);
			}

			throw new Error(`Unexpected fetch ${url}`);
		});

		vi.stubGlobal("fetch", fetchMock);

		const { result } = renderHook(() => useRSSVideos(), {
			wrapper: createWrapper(),
		});

		await waitFor(() => {
			expect(result.current.videos[0]?.title).toBe("Old cached video");
		});

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 2100));
		});

		await waitFor(() => {
			expect(result.current.videos[0]?.title).toBe("Fresh scheduled video");
		});
	});

	it("exposes scheduled refresh timing from the server status", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith("/api/videos/status"))
				return statusResponse({
					completedAt: "2026-05-09T10:00:00.000Z",
					scheduledRefresh: {
						enabled: true,
						intervalMs: 15 * 60 * 1000,
						nextRunAt: "2026-05-09T10:15:00.000Z",
						lastRunAt: "2026-05-09T10:00:00.000Z",
					},
				});
			if (url === "/api/videos" || url.startsWith("/api/videos?"))
				return videosResponse([], "2026-05-09T10:00:00.000Z");
			throw new Error(`Unexpected fetch ${url}`);
		});

		vi.stubGlobal("fetch", fetchMock);

		const { result } = renderHook(() => useRSSVideos(), {
			wrapper: createWrapper(),
		});

		await waitFor(() => {
			expect(result.current.syncStatus.scheduledRefresh).toEqual({
				enabled: true,
				intervalMs: 15 * 60 * 1000,
				nextRunAt: "2026-05-09T10:15:00.000Z",
				lastRunAt: "2026-05-09T10:00:00.000Z",
			});
		});
	});

	it("bypasses browser caching when refetching videos", async () => {
		let videoCalls = 0;
		let statusCalls = 0;

		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);

				if (url.startsWith("/api/videos/status")) {
					statusCalls += 1;
					// First call: "running" so refetchInterval=1500ms triggers faster
					// Subsequent calls: "idle" with newer lastUpdated to trigger invalidation
					const isFirst = statusCalls <= 1;
					return statusResponse({
						state: isFirst ? "running" : "idle",
						lastUpdated: isFirst
							? "2026-06-01T11:59:00.000Z"
							: "2026-06-01T12:01:00.000Z",
					});
				}

				if (url === "/api/videos" || url.startsWith("/api/videos?")) {
					videoCalls += 1;
					expect(init).toMatchObject({
						cache: "no-store",
						credentials: "same-origin",
					});
					return videosResponse(
						[
							video(
								videoCalls === 1 ? "First video" : "Fresh video",
								videoCalls === 1 ? "vid-1" : "vid-2",
								videoCalls === 1
									? "2026-06-01T12:00:00.000Z"
									: "2026-06-01T12:01:00.000Z",
							),
						],
						videoCalls === 1
							? "2026-06-01T12:00:00.000Z"
							: "2026-06-01T12:01:00.000Z",
					);
				}

				throw new Error(`Unexpected fetch ${url}`);
			},
		);

		vi.stubGlobal("fetch", fetchMock);

		const { result } = renderHook(() => useRSSVideos(), {
			wrapper: createWrapper(),
		});

		// Wait for initial load — first call
		await waitFor(() => {
			expect(result.current.videos[0]?.title).toBe("First video");
		});

		expect(videoCalls).toBe(1);

		// Wait for the status poll to fire again with a newer lastUpdated
		// (status polls every 2s when in "running" state)
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 2500));
		});

		await waitFor(() => {
			expect(result.current.videos[0]?.title).toBe("Fresh video");
		});
		expect(videoCalls).toBeGreaterThanOrEqual(2);
	});
});
