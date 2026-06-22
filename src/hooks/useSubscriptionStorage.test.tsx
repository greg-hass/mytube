import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSubscriptionStorage } from "./useSubscriptionStorage";

const addSubscriptions = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockState = vi.hoisted(() => ({
	searchQuery: "",
	sortBy: "recent",
	apiKey: "",
	watchedVideos: new Set<string>(),
	quotaUsed: 0,
	setQuota: vi.fn(),
	setApiExhausted: vi.fn(),
	setWatchedVideos: vi.fn(),
}));

vi.mock("../lib/indexeddb", () => ({
	getAllSubscriptions: vi.fn().mockResolvedValue([]),
	addSubscriptions,
	removeSubscription: vi.fn().mockResolvedValue(undefined),
	clearAllSubscriptions: vi.fn().mockResolvedValue(undefined),
	getSubscriptionCount: vi.fn().mockResolvedValue(0),
	toggleFavorite: vi.fn().mockResolvedValue(undefined),
	toggleMute: vi.fn().mockResolvedValue(undefined),
	setSubscriptionGroup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/icon-loader", () => ({
	resolveChannelThumbnail: vi.fn().mockResolvedValue(null),
}));

vi.mock("../store/useStore", () => {
	const useStore = Object.assign(() => mockState, {
		getState: () => mockState,
	});

	return { useStore };
});

vi.mock("sonner", () => ({
	toast: {
		dismiss: vi.fn(),
		success: vi.fn(),
		warning: vi.fn(),
		error: vi.fn(),
	},
}));

const remoteSubscription = {
	id: "UC_REMOTE",
	title: "Server channel",
	addedAt: 1,
};

function wrapper({ children }: { children: ReactNode }) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	});

	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}

describe("useSubscriptionStorage", () => {
	beforeEach(() => {
		addSubscriptions.mockClear();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					subscriptions: [remoteSubscription],
					watchedVideos: [],
					redirects: {},
				}),
			}),
		);
	});

	it("returns server subscriptions during first load when the local database is empty", async () => {
		const { result } = renderHook(() => useSubscriptionStorage(), { wrapper });

		await waitFor(() => {
			expect(result.current.allSubscriptions).toEqual([
				expect.objectContaining({ id: "UC_REMOTE", title: "Server channel" }),
			]);
		});
	});

	it("retries force-push after a 412 revision mismatch instead of silently failing", async () => {
		let postCallCount = 0;
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			const method = init?.method || "GET";

			// All GET calls return server state with syncRevision.
			if (method === "GET") {
				return {
					ok: true,
					json: async () => ({
						subscriptions: [remoteSubscription],
						watchedVideos: [],
						redirects: {},
						syncRevision: 1,
					}),
				};
			}

			// POST calls: first gets 412, retry gets 200.
			postCallCount += 1;
			if (postCallCount === 1) {
				return {
					ok: false,
					status: 412,
					json: async () => ({
						error: "Sync revision mismatch",
						currentRevision: 2,
					}),
				};
			}
			return {
				ok: true,
				json: async () => ({
					success: true,
					syncRevision: 3,
					timestamp: "now",
				}),
			};
		});

		vi.stubGlobal("fetch", fetchMock);

		const { result } = renderHook(() => useSubscriptionStorage(), { wrapper });

		// Wait for initial sync to finish.
		await waitFor(() => {
			expect(result.current.allSubscriptions.length).toBeGreaterThan(0);
		});

		// Trigger a force-push via clearAll.
		result.current.clearAll();

		// The clearAll mutation calls syncWithBackend({ forcePush: true }),
		// which calls pushLocalStateToBackend → pushToServer.
		// On 412, pushToServer updates the revision ref, then pushLocalStateToBackend retries.
		await waitFor(
			() => {
				expect(postCallCount).toBe(2);
			},
			{ timeout: 5000 },
		);
	});
});
