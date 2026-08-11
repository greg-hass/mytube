import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveVideos } from "./useLiveVideos";

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}

function liveResponse(title = "Live now") {
	return new Response(
		JSON.stringify({
			videos: [
				{
					id: "live-1",
					title,
					description: "",
					thumbnail: "",
					channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
					channelTitle: "Channel",
					publishedAt: "2026-08-11T10:00:00.000Z",
					isLive: true,
					liveBroadcastContent: "live",
				},
			],
			checkedAt: "2026-08-11T10:01:00.000Z",
			totalChannels: 1,
			checkedChannels: 1,
			invalidChannels: 0,
			failedChannels: [],
		}),
	);
}

describe("useLiveVideos", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("does not scan until the Live view is enabled", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		renderHook(() => useLiveVideos(false), { wrapper: createWrapper() });
		await act(async () => {});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("loads confirmed live streams with no browser caching", async () => {
		const fetchMock = vi.fn(async () => liveResponse());
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderHook(() => useLiveVideos(true), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.data.videos).toHaveLength(1));
		expect(fetchMock).toHaveBeenCalledWith("/api/videos/live", {
			cache: "no-store",
			credentials: "same-origin",
		});
	});

	it("bypasses the server TTL when the user explicitly refreshes", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(liveResponse("Initial"))
			.mockResolvedValueOnce(liveResponse("Refreshed"));
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderHook(() => useLiveVideos(true), {
			wrapper: createWrapper(),
		});
		await waitFor(() => expect(result.current.data.videos[0]?.title).toBe("Initial"));

		await act(async () => {
			await result.current.forceRefresh();
		});

		expect(fetchMock).toHaveBeenLastCalledWith("/api/videos/live?refresh=1", {
			cache: "no-store",
			credentials: "same-origin",
		});
		await waitFor(() =>
			expect(result.current.data.videos[0]?.title).toBe("Refreshed"),
		);
	});
});
