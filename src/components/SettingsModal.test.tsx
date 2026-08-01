import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";
import {
	installFetchMock,
	installLocalStorageMock,
} from "./SettingsModal.test-helpers";

const invalidateQueries = vi.fn();
const clearAllCachedVideos = vi.fn();
const scrollToMock = vi.hoisted(() => vi.fn());
const storeMocks = vi.hoisted(() => ({
	setApiKey: vi.fn(),
	setDeepseekApiKey: vi.fn(),
	setCustomApiKey: vi.fn(),
	setLlmProvider: vi.fn(),
	setLlmApiKey: vi.fn(),
	setLlmModel: vi.fn(),
	setWatchedVideos: vi.fn(),
}));
const subscriptionMocks = vi.hoisted(() => ({
	addSubscriptions: vi.fn(),
	syncWithBackend: vi.fn(),
	resolveChannelIds: vi.fn(),
	repairChannelIcons: vi.fn(),
	removeSubscription: vi.fn(),
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

vi.mock("../store/useStore", () => {
	const state = {
		apiKey: "key",
		deepseekApiKey: "",
		customApiKey: "",
		llmProvider: "opencode",
		llmApiKey: "",
		llmModel: "big-pickle",
		setApiKey: storeMocks.setApiKey,
		setDeepseekApiKey: storeMocks.setDeepseekApiKey,
		setCustomApiKey: storeMocks.setCustomApiKey,
		setLlmProvider: storeMocks.setLlmProvider,
		setLlmApiKey: storeMocks.setLlmApiKey,
		setLlmModel: storeMocks.setLlmModel,
		watchedVideos: new Set(["watched-1", "watched-2"]),
		setWatchedVideos: storeMocks.setWatchedVideos,
	};
	const storeFn = (selector?: (s: typeof state) => unknown) =>
		selector ? selector(state) : state;
	storeFn.getState = () => state;
	return { useStore: storeFn };
});

vi.mock("../hooks/useSubscriptionStorage", () => ({
		useSubscriptionStorage: () => ({
			rawSubscriptions: [
			{
				id: "handle_one",
				title: "One",
				addedAt: 1,
				thumbnail: "https://ui-avatars.com/api/?name=One",
			},
			{
				id: "UC2",
				title: "Two",
				addedAt: 2,
				thumbnail: "https://example.com/two.jpg",
				customUrl: "@one",
			},
			{ id: "UC3", title: "Three", addedAt: 3, thumbnail: "https://example.com/three.jpg" },
		],
		addSubscriptions: subscriptionMocks.addSubscriptions,
		syncWithBackend: subscriptionMocks.syncWithBackend,
		resolveChannelIds: subscriptionMocks.resolveChannelIds,
		repairChannelIcons: subscriptionMocks.repairChannelIcons,
		removeSubscription: subscriptionMocks.removeSubscription,
	}),
}));

describe("SettingsModal", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		onClose.mockClear();
		scrollToMock.mockClear();
		Object.defineProperty(window, "scrollTo", {
			configurable: true,
			value: scrollToMock,
		});
		invalidateQueries.mockClear();
		clearAllCachedVideos.mockReset().mockResolvedValue(undefined);
		for (const key of Object.keys(storeMocks) as (keyof typeof storeMocks)[]) {
			storeMocks[key].mockClear();
		}
		for (const key of Object.keys(
			subscriptionMocks,
		) as (keyof typeof subscriptionMocks)[]) {
			subscriptionMocks[key].mockReset().mockResolvedValue(
				key === "repairChannelIcons" ? 1 : undefined,
			);
		}
		installFetchMock();
		installLocalStorageMock();
	});

	it("keeps the mobile settings header below the top safe area", async () => {
		await renderModal();

		// The glass header itself carries the safe-top class (matching the
		// main app Header pattern) — not the modal container.
		const headerLabel = screen.getByText("Settings");
		const header = headerLabel.closest(".glass");
		expect(header?.className).toContain("safe-top");
	});

	it("locks background scrolling and restores the previous position on close", async () => {
		Object.defineProperty(window, "scrollY", {
			configurable: true,
			value: 480,
		});

		const { rerender } = await renderModal();

		expect(document.documentElement.style.overflow).toBe("hidden");
		expect(document.body.style.position).toBe("fixed");
		expect(document.body.style.top).toBe("-480px");
		expect(document.body.style.overflow).toBe("hidden");

		rerender(<SettingsModal isOpen={false} onClose={onClose} />);

		expect(document.documentElement.style.overflow).toBe("");
		expect(document.body.style.position).toBe("");
		expect(document.body.style.top).toBe("");
		expect(document.body.style.overflow).toBe("");
		expect(scrollToMock).toHaveBeenCalledWith({ top: 480, behavior: "auto" });
	});

	it("keeps the settings body as an independently scrollable safe-area region", async () => {
		await renderModal();

		const body = screen.getByTestId("settings-modal-body");
		expect(body.className).toContain("min-h-0");
		expect(body.className).toContain("overflow-y-auto");
		expect(body.className).toContain("overscroll-contain");
		expect(body.className).toContain("safe-area-inset-bottom");
	});

	it("contains keyboard focus and restores the opener when closed", async () => {
		const { rerender } = render(
			<>
				<button type="button">Open Settings</button>
				<SettingsModal isOpen={false} onClose={onClose} />
			</>,
		);
		const opener = screen.getByRole("button", { name: "Open Settings" });
		opener.focus();

		rerender(
			<>
				<button type="button">Open Settings</button>
				<SettingsModal isOpen onClose={onClose} />
			</>,
		);

		const dialog = await screen.findByRole("dialog", { name: /settings/i });
		const focusableElements = Array.from(
			dialog.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
			),
		);
		const firstElement = focusableElements[0];
		const lastElement = focusableElements[focusableElements.length - 1];

		expect(screen.getByRole("button", { name: "Close Settings" })).toHaveFocus();

		firstElement.focus();
		fireEvent.keyDown(firstElement, { key: "Tab", shiftKey: true });
		expect(lastElement).toHaveFocus();

		fireEvent.keyDown(lastElement, { key: "Tab" });
		expect(firstElement).toHaveFocus();

		fireEvent.keyDown(firstElement, { key: "Escape" });
		expect(onClose).toHaveBeenCalledOnce();

		rerender(
			<>
				<button type="button">Open Settings</button>
				<SettingsModal isOpen={false} onClose={onClose} />
			</>,
		);
		expect(opener).toHaveFocus();
	});

	it("shows backup health counts in Settings", async () => {
		await renderModal();
		expect(screen.getByText("Data Health")).toBeInTheDocument();
		expect(screen.getByText("3 subscriptions")).toBeInTheDocument();
		expect(screen.getByText("2 watched")).toBeInTheDocument();
		expect(screen.getByText("1 favorite")).toBeInTheDocument();
		expect(screen.getByText("2 feed filters")).toBeInTheDocument();
		expect(screen.queryByText("2 queued")).not.toBeInTheDocument();
	});

	it("reports subscription findings and provides safe repair actions", async () => {
		await renderModal();

		expect(screen.getByText("Subscription Health")).toBeInTheDocument();
		expect(screen.getByText("1 needs channel ID")).toBeInTheDocument();
		expect(screen.getByText("1 need artwork")).toBeInTheDocument();
		expect(
			screen.queryByText(
				"Save a YouTube Data API key to resolve these channels.",
			),
		).not.toBeInTheDocument();

		fireEvent.click(
			screen.getByRole("button", { name: "Resolve Channel IDs" }),
		);
		await waitFor(() => {
			expect(subscriptionMocks.resolveChannelIds).toHaveBeenCalledOnce();
		});
		expect(await screen.findByText("Channel ID resolution finished.")).toBeInTheDocument();

		fireEvent.click(
			screen.getByRole("button", { name: "Repair Channel Artwork" }),
		);
		await waitFor(() => {
			expect(subscriptionMocks.repairChannelIcons).toHaveBeenCalledOnce();
		});
			expect(
				await screen.findByText("Repaired artwork for 1 channel."),
			).toBeInTheDocument();
	});

	it("requires review and confirmation before removing a duplicate", async () => {
		await renderModal();

		expect(screen.getByTestId("duplicate-review-group")).toBeInTheDocument();
		fireEvent.click(
			screen.getByRole("button", { name: "Review removal for One" }),
		);
		expect(
			screen.getByText(
				"Remove this subscription from the server and this browser?",
			),
		).toBeInTheDocument();
		expect(subscriptionMocks.removeSubscription).not.toHaveBeenCalled();

		fireEvent.click(
			screen.getByRole("button", { name: "Confirm remove One" }),
		);
		await waitFor(() => {
			expect(subscriptionMocks.removeSubscription).toHaveBeenCalledWith(
				"handle_one",
			);
		});
		expect(
			await screen.findByText("Removed subscription One."),
		).toBeInTheDocument();
	});

	it("explains that backups include all user-owned app data and shows storage health", async () => {
		await renderModal();
		expect(
			screen.getByText(
				/Subscriptions, watched videos, favorites, feed filters, groups, and settings/i,
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
			expect(screen.getByTestId("restore-backup-review")).toBeInTheDocument();
		});
		expect(subscriptionMocks.addSubscriptions).not.toHaveBeenCalled();
		expect(screen.getByText(/Existing subscriptions stay in place/i)).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Confirm restore" }));

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

		expect(screen.getByTestId("reset-feed-cache-review")).toBeInTheDocument();
		expect(
			screen.getByText("This will remove 42 cached videos from the browser and server."),
		).toBeInTheDocument();
		expect(fetch).not.toHaveBeenCalledWith("/api/videos/cache/reset", {
			method: "POST",
		});

		fireEvent.click(screen.getByRole("button", { name: "Confirm reset" }));

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
		expect(screen.getByText(/Last successful refresh/i)).toBeInTheDocument();
		expect(
			screen.getByText("No RSS videos or metadata returned"),
		).toBeInTheDocument();
		expect(screen.getByText("Feed unavailable")).toBeInTheDocument();
		expect(
			screen.getByText(/The feed did not provide usable data/i),
		).toBeInTheDocument();
	});

	it("can retry one failed channel from Settings", async () => {
		await renderModal();
		fireEvent.click(screen.getByRole("button", { name: "Retry Broken Channel" }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith(
				"/api/videos/refresh/channel/UC_BAD",
				{
					method: "POST",
					cache: "no-store",
					credentials: "same-origin",
				},
			);
		});
		expect(await screen.findByText("Channel refresh queued")).toBeInTheDocument();
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

	it("keeps YouTube API as the only discovery fallback setting", async () => {
		await renderModal();
		expect(screen.getByText("YouTube Data API Key")).toBeInTheDocument();
		expect(screen.queryByText("Brave Search API Key")).not.toBeInTheDocument();
		expect(screen.queryByText("OpenCode API Key")).not.toBeInTheDocument();
		expect(screen.queryByText("DeepSeek API Key")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

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
