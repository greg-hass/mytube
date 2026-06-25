import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";
import {
	installFetchMock,
	installLocalStorageMock,
} from "./SettingsModal.test-helpers";

const invalidateQueries = vi.fn();
const clearAllCachedVideos = vi.fn();
const storeMocks = vi.hoisted(() => ({
	setApiKey: vi.fn(),
	setBraveApiKey: vi.fn(),
	setOpencodeApiKey: vi.fn(),
	setLlmProvider: vi.fn(),
	setLlmApiKey: vi.fn(),
	setLlmModel: vi.fn(),
	setWatchedVideos: vi.fn(),
}));
const subscriptionMocks = vi.hoisted(() => ({
	addSubscriptions: vi.fn(),
	syncWithBackend: vi.fn(),
}));

const onClose = vi.fn();

async function renderModal() {
	const result = render(<SettingsModal isOpen onClose={onClose} />);
	expect(await screen.findByText("Online")).toBeInTheDocument();
	return result;
}

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
		braveApiKey: "",
		opencodeApiKey: "",
		llmProvider: "opencode",
		llmApiKey: "",
		llmModel: "big-pickle",
		setApiKey: storeMocks.setApiKey,
		setBraveApiKey: storeMocks.setBraveApiKey,
		setOpencodeApiKey: storeMocks.setOpencodeApiKey,
		setLlmProvider: storeMocks.setLlmProvider,
		setLlmApiKey: storeMocks.setLlmApiKey,
		setLlmModel: storeMocks.setLlmModel,
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
		for (const key of Object.keys(storeMocks) as (keyof typeof storeMocks)[]) {
			storeMocks[key].mockClear();
		}
		for (const key of Object.keys(
			subscriptionMocks,
		) as (keyof typeof subscriptionMocks)[]) {
			subscriptionMocks[key].mockReset().mockResolvedValue(undefined);
		}
		installFetchMock();
		installLocalStorageMock();
	});

	it("keeps the mobile settings header below the top safe area", async () => {
		await renderModal();

		// The "Settings" text is nested inside the glass header; walk up to
		// find the modal container that carries the safe-area padding.
		const headerLabel = screen.getByText("Settings");
		const modal = headerLabel.closest(
			'[class*="pt-[env(safe-area-inset-top)]"]',
		);
		expect(modal?.className).toContain("pt-[env(safe-area-inset-top)]");
		expect(modal?.className).toContain("md:pt-0");
	});

	it("shows backup health counts in Settings", async () => {
		await renderModal();
		expect(screen.getByText("Data Health")).toBeInTheDocument();
		expect(screen.getByText("3 subscriptions")).toBeInTheDocument();
		expect(screen.getByText("2 watched")).toBeInTheDocument();
		expect(screen.getByText("2 queued")).toBeInTheDocument();
		expect(screen.getByText("1 favorite")).toBeInTheDocument();
		expect(screen.getByText("2 feed filters")).toBeInTheDocument();
	});

	it("explains that backups include all user-owned app data and shows storage health", async () => {
		await renderModal();
		expect(
			screen.getByText(
				/Subscriptions, watched videos, favorites, queue, feed filters, groups, and settings/i,
			),
		).toBeInTheDocument();
		expect(screen.getByText("Storage healthy")).toBeInTheDocument();
	});

	it("shows when storage was recovered from a startup backup", async () => {
		installFetchMock({
			dataIntegrity: [
				{
					file: "/data/db.json",
					status: "restored",
					backupFile: "/data/backups/db.bak.json",
				},
			],
			failedChannels: [],
		});

		await renderModal();

		expect(
			await screen.findByText("Recovered from backup on startup"),
		).toBeInTheDocument();
	});

	it("reports restored subscription and watched counts after importing a backup", async () => {
		const { container } = await renderModal();
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
		await renderModal();
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
		await renderModal();
		expect(screen.getByText("Server")).toBeInTheDocument();
		expect(screen.getByText("Online")).toBeInTheDocument();
		expect(screen.getByText("Server 1.0.0")).toBeInTheDocument();
		expect(screen.getByText("App 0.0.0")).toBeInTheDocument();
		expect(screen.getByText("3 server subscriptions")).toBeInTheDocument();
		expect(screen.getByText("42 cached videos")).toBeInTheDocument();
	});

	it("shows failed refresh channels in Settings", async () => {
		await renderModal();
		expect(screen.getByText("Refresh Issues")).toBeInTheDocument();
		expect(screen.getByText("Broken Channel")).toBeInTheDocument();
		expect(
			screen.getByText("No RSS videos or metadata returned"),
		).toBeInTheDocument();
	});

	it("can retry failed channel refreshes from Settings", async () => {
		await renderModal();
		expect(screen.getByText("Refresh Issues")).toBeInTheDocument();
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

	it("saves a brave api key alongside the youtube api key", async () => {
		await renderModal();
		fireEvent.change(
			screen.getByPlaceholderText("Enter your Brave Search API key..."),
			{
				target: { value: "new-brave-key" },
			},
		);
		fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

		expect(storeMocks.setBraveApiKey).toHaveBeenCalledWith("new-brave-key");
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
