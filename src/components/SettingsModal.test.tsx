import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";

const invalidateQueries = vi.fn();
const clearAllCachedVideos = vi.fn();
const storeMocks = vi.hoisted(() => ({
	setApiKey: vi.fn(),
	setWatchedVideos: vi.fn(),
}));
const subscriptionMocks = vi.hoisted(() => ({
	addSubscriptions: vi.fn(),
	syncWithBackend: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({
		invalidateQueries,
	}),
}));

vi.mock("../lib/indexeddb", () => ({
	clearAllCachedVideos: () => clearAllCachedVideos(),
}));

vi.mock("framer-motion", () => ({
	AnimatePresence: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
	motion: {
		div: ({ children, initial, animate, exit, ...props }: any) => {
			void initial;
			void animate;
			void exit;
			return <div {...props}>{children}</div>;
		},
	},
}));

vi.mock("../store/useStore", () => ({
	useStore: () => ({
		apiKey: "key",
		setApiKey: storeMocks.setApiKey,
		watchedVideos: new Set(["watched-1", "watched-2"]),
		setWatchedVideos: storeMocks.setWatchedVideos,
	}),
}));

vi.mock("../hooks/useSubscriptionStorage", () => ({
	useSubscriptionStorage: () => ({
		rawSubscriptions: [
			{ id: "UC1", title: "One", addedAt: 1 },
			{ id: "UC2", title: "Two", addedAt: 2 },
			{ id: "UC3", title: "Three", addedAt: 3 },
		],
		addSubscriptions: subscriptionMocks.addSubscriptions,
		syncWithBackend: subscriptionMocks.syncWithBackend,
	}),
}));

describe("SettingsModal", () => {
	beforeEach(() => {
		invalidateQueries.mockClear();
		clearAllCachedVideos.mockReset().mockResolvedValue(undefined);
		storeMocks.setApiKey.mockClear();
		storeMocks.setWatchedVideos.mockClear();
		subscriptionMocks.addSubscriptions.mockReset().mockResolvedValue(undefined);
		subscriptionMocks.syncWithBackend.mockReset().mockResolvedValue(undefined);
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string) => {
				if (url === "/api/health") {
					return Promise.resolve({
						ok: true,
						json: async () => ({
							status: "ok",
							subscriptions: 3,
							videos: 42,
							lastUpdated: "2026-05-09T20:00:00.000Z",
							dataIntegrity: [
								{ file: "/data/db.json", status: "ok", backupFile: null },
								{ file: "/data/videos.json", status: "ok", backupFile: null },
							],
						}),
					});
				}
				if (url === "/api/version") {
					return Promise.resolve({
						ok: true,
						json: async () => ({
							name: "youtube-subscriptions-api",
							version: "1.0.0",
							appVersion: "0.0.0",
						}),
					});
				}
				if (url === "/api/videos/status") {
					return Promise.resolve({
						ok: true,
						json: async () => ({
							errors: 1,
							failedChannels: [
								{
									id: "UC_BAD",
									title: "Broken Channel",
									reason: "No RSS videos or metadata returned",
								},
							],
						}),
					});
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ success: true }),
				});
			}),
		);
		const storage = new Map<string, string>([
			["favorite-video-ids", JSON.stringify(["fav-1"])],
			["queued-video-ids", JSON.stringify(["queue-1", "queue-2"])],
			[
				"feed-quality-filters",
				JSON.stringify({ hidePremieres: true, mutedKeywordText: "rumor" }),
			],
		]);
		vi.stubGlobal("localStorage", {
			getItem: vi.fn((key: string) => storage.get(key) ?? null),
			setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
			removeItem: vi.fn((key: string) => storage.delete(key)),
			clear: vi.fn(() => storage.clear()),
		});
	});

	it("keeps the mobile settings header below the top safe area", async () => {
		render(<SettingsModal isOpen onClose={vi.fn()} />);

		expect(await screen.findByText("Online")).toBeInTheDocument();

		// The "Settings" text is nested inside the glass header; walk up to
		// find the modal container that carries the safe-area padding.
		const headerLabel = screen.getByText("Settings");
		const modal = headerLabel.closest(
			'[class*="pt-[env(safe-area-inset-top)"]',
		);
		expect(modal?.className).toContain("pt-[env(safe-area-inset-top)]");
		expect(modal?.className).toContain("md:pt-0");
	});

	it("shows backup health counts in Settings", async () => {
		render(<SettingsModal isOpen onClose={vi.fn()} />);

		expect(await screen.findByText("Online")).toBeInTheDocument();
		expect(screen.getByText("Data Health")).toBeInTheDocument();
		expect(screen.getByText("3 subscriptions")).toBeInTheDocument();
		expect(screen.getByText("2 watched")).toBeInTheDocument();
		expect(screen.getByText("2 queued")).toBeInTheDocument();
		expect(screen.getByText("1 favorite")).toBeInTheDocument();
		expect(screen.getByText("2 feed filters")).toBeInTheDocument();
	});

	it("explains that backups include all user-owned app data and shows storage health", async () => {
		render(<SettingsModal isOpen onClose={vi.fn()} />);

		expect(await screen.findByText("Online")).toBeInTheDocument();
		expect(
			screen.getByText(
				/Subscriptions, watched videos, favorites, queue, feed filters, groups, and settings/i,
			),
		).toBeInTheDocument();
		expect(screen.getByText("Storage healthy")).toBeInTheDocument();
	});

	it("shows when storage was recovered from a startup backup", async () => {
		vi.mocked(fetch).mockImplementation((input: URL | RequestInfo) => {
			const url = String(input);
			if (url === "/api/health") {
				return Promise.resolve({
					ok: true,
					json: async () => ({
						status: "ok",
						subscriptions: 3,
						videos: 42,
						lastUpdated: "2026-05-09T20:00:00.000Z",
						dataIntegrity: [
							{
								file: "/data/db.json",
								status: "restored",
								backupFile: "/data/backups/db.bak.json",
							},
						],
					}),
				} as Response);
			}
			if (url === "/api/version") {
				return Promise.resolve({
					ok: true,
					json: async () => ({
						name: "youtube-subscriptions-api",
						version: "1.0.0",
						appVersion: "0.0.0",
					}),
				} as Response);
			}
			if (url === "/api/videos/status") {
				return Promise.resolve({
					ok: true,
					json: async () => ({ failedChannels: [] }),
				} as Response);
			}
			return Promise.resolve({
				ok: true,
				json: async () => ({ success: true }),
			} as Response);
		});

		render(<SettingsModal isOpen onClose={vi.fn()} />);

		expect(
			await screen.findByText("Recovered from backup on startup"),
		).toBeInTheDocument();
	});

	it("reports restored subscription and watched counts after importing a backup", async () => {
		const { container } = render(<SettingsModal isOpen onClose={vi.fn()} />);
		const input = container.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		const backup = {
			version: 2,
			exportedAt: "2026-05-14T12:00:00.000Z",
			subscriptions: [{ id: "UC_RESTORE", title: "Restored Channel" }],
			settings: { apiKey: "restored-key" },
			watchedVideos: ["watched-a", "watched-b"],
			favorites: { videoIds: [], videos: [] },
			queue: { videoIds: [], videos: [] },
			feedQualityFilters: {},
		};

		fireEvent.change(input, {
			target: {
				files: [{ text: () => Promise.resolve(JSON.stringify(backup)) }],
			},
		});

		await waitFor(() => {
			expect(
				screen.getByText(
					"Backup restored: 1 subscription and 2 watched videos",
				),
			).toBeInTheDocument();
		});
	});

	it("resets feed cache without clearing saved user data", async () => {
		render(<SettingsModal isOpen onClose={vi.fn()} />);

		expect(await screen.findByText("Online")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Reset Feed Cache" }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith("/api/videos/cache/reset", {
				method: "POST",
			});
		});
		expect(clearAllCachedVideos).toHaveBeenCalledOnce();
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["server-videos"],
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["server-videos-status"],
		});
		expect(localStorage.getItem("favorite-video-ids")).toBe(
			JSON.stringify(["fav-1"]),
		);
		expect(localStorage.getItem("queued-video-ids")).toBe(
			JSON.stringify(["queue-1", "queue-2"]),
		);
		expect(await screen.findByText("Feed cache reset")).toBeInTheDocument();
	});

	it("shows server health and version in Settings", async () => {
		render(<SettingsModal isOpen onClose={vi.fn()} />);

		expect(await screen.findByText("Server")).toBeInTheDocument();
		expect(screen.getByText("Online")).toBeInTheDocument();
		expect(screen.getByText("Server 1.0.0")).toBeInTheDocument();
		expect(screen.getByText("App 0.0.0")).toBeInTheDocument();
		expect(screen.getByText("3 server subscriptions")).toBeInTheDocument();
		expect(screen.getByText("42 cached videos")).toBeInTheDocument();
	});

	it("shows failed refresh channels in Settings", async () => {
		render(<SettingsModal isOpen onClose={vi.fn()} />);

		expect(await screen.findByText("Refresh Issues")).toBeInTheDocument();
		expect(screen.getByText("Broken Channel")).toBeInTheDocument();
		expect(
			screen.getByText("No RSS videos or metadata returned"),
		).toBeInTheDocument();
	});

	it("can retry failed channel refreshes from Settings", async () => {
		render(<SettingsModal isOpen onClose={vi.fn()} />);

		expect(await screen.findByText("Refresh Issues")).toBeInTheDocument();
		fireEvent.click(
			screen.getByRole("button", { name: "Retry Failed Channels" }),
		);

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith("/api/videos/refresh", {
				method: "POST",
			});
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["server-videos"],
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["server-videos-status"],
		});
		expect(await screen.findByText("Retry started")).toBeInTheDocument();
	});

	it("retries protected data loading after saving a server API token", async () => {
		render(<SettingsModal isOpen onClose={vi.fn()} />);

		expect(await screen.findByText("Online")).toBeInTheDocument();
		fireEvent.change(
			screen.getByPlaceholderText("Match the required SERVER_API_TOKEN"),
			{
				target: { value: "new-browser-token" },
			},
		);
		fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

		expect(localStorage.setItem).toHaveBeenCalledWith(
			"mytube.serverApiToken",
			"new-browser-token",
		);
		expect(subscriptionMocks.syncWithBackend).toHaveBeenCalledWith({
			importRemoteWatched: true,
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["server-videos"],
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["server-videos-status"],
		});
	});
});
