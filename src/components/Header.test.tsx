import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

vi.mock("framer-motion", () => ({
	motion: {
		header: ({ animate, children, initial, ...props }: any) => {
			void animate;
			void initial;
			return <header {...props}>{children}</header>;
		},
		div: ({ children, whileHover, ...props }: any) => {
			void whileHover;
			return <div {...props}>{children}</div>;
		},
		button: ({ children, whileHover, whileTap, ...props }: any) => {
			void whileHover;
			void whileTap;
			return <button {...props}>{children}</button>;
		},
	},
}));

vi.mock("../store/useStore", () => ({
	useStore: () => ({
		theme: "dark",
		toggleTheme: vi.fn(),
		viewMode: "grid",
		setViewMode: vi.fn(),
		sortBy: "recent",
		setSortBy: vi.fn(),
		searchQuery: "",
		setSearchQuery: vi.fn(),
	}),
}));

vi.mock("../hooks/useSubscriptionStorage", () => ({
	useSubscriptionStorage: () => ({
		count: 261,
		exportOPML: vi.fn(),
		exportJSON: vi.fn(),
		importOPML: vi.fn(),
		isImporting: false,
	}),
}));

vi.mock("./SettingsModal", () => ({
	SettingsModal: () => null,
}));

vi.mock("./OPMLUpload", () => ({
	OPMLUpload: ({ minimal }: { minimal?: boolean }) => (
		<button>{minimal ? "Import" : "Upload"}</button>
	),
}));

describe("Header", () => {
	it("moves mobile actions into a slide-in menu instead of permanent toolbar chrome", () => {
		render(
			<Header
				showShorts={true}
				onToggleShorts={vi.fn()}
				hideWatched={false}
				onToggleWatched={vi.fn()}
				onOpenFilters={vi.fn()}
			/>,
		);

		const menuButton = screen.getByTestId("mobile-menu-button");
		const mobileControls = menuButton.closest(".mobile-header-controls");

		expect(menuButton).toBeInTheDocument();
		expect(mobileControls).toBeInTheDocument();
		expect(screen.getByTestId("mobile-filter-button")).toBeInTheDocument();
		expect(screen.getByTestId("mobile-shorts-toggle")).toBeInTheDocument();
		expect(screen.getByTestId("mobile-watched-toggle")).toBeInTheDocument();
		expect(
			screen.queryByTestId("mobile-add-channel-button"),
		).not.toBeInTheDocument();
		expect(screen.queryByTestId("mobile-toolbar")).not.toBeInTheDocument();
		expect(document.querySelectorAll(".desktop-header-controls")).toHaveLength(
			2,
		);
	});

	it("keeps the full desktop toolbar for wide screens and uses compact controls below xl", () => {
		render(<Header />);

		const desktopControls = document.querySelectorAll(
			".desktop-header-controls",
		);
		const mobileControls = screen
			.getByTestId("mobile-menu-button")
			.closest(".mobile-header-controls");

		desktopControls.forEach((controls) => {
			expect(controls.className).toContain("xl:");
			expect(controls.className).not.toContain("md:");
		});
		expect(mobileControls?.className).toContain("xl:hidden");
		expect(mobileControls?.className).not.toContain("md:hidden");
	});

	it("publishes its measured height for sticky dashboard chrome", () => {
		const offsetHeightSpy = vi
			.spyOn(HTMLElement.prototype, "offsetHeight", "get")
			.mockReturnValue(112);

		const { unmount } = render(<Header />);

		expect(
			document.documentElement.style.getPropertyValue(
				"--app-current-header-height",
			),
		).toBe("112px");

		unmount();
		offsetHeightSpy.mockRestore();

		expect(
			document.documentElement.style.getPropertyValue(
				"--app-current-header-height",
			),
		).toBe("");
	});

	it("shows a pulsing refresh dot next to the channel count while syncing", () => {
		render(
			<Header
				syncStatus={{
					total: 1,
					current: 1,
					isSyncing: true,
					lastUpdated: Date.now(),
					errors: 0,
					videos: 1,
					state: "running",
					failedChannels: [],
				}}
			/>,
		);

		expect(screen.getByText("261 channels")).toBeInTheDocument();
		expect(screen.getByAltText("MyTube")).toBeInTheDocument();
		expect(
			document.querySelector(".bg-emerald-500.animate-pulse"),
		).toBeInTheDocument();
	});

	it("hides the refresh dot when not syncing", () => {
		render(<Header />);

		expect(screen.getByText("261 channels")).toBeInTheDocument();
		expect(
			document.querySelector(".bg-emerald-500.animate-pulse"),
		).not.toBeInTheDocument();
	});

	it("opens feed filters from the mobile header filter button", () => {
		const onOpenFilters = vi.fn();
		render(<Header showFilters={true} onOpenFilters={onOpenFilters} />);

		fireEvent.click(screen.getByTestId("mobile-filter-button"));

		expect(onOpenFilters).toHaveBeenCalledOnce();
	});

	it("renders the mobile menu overlay outside the animated header", () => {
		render(<Header />);

		fireEvent.click(screen.getByTestId("mobile-menu-button"));

		const menuPanel = screen.getByTestId("mobile-menu-panel");
		expect(menuPanel.closest("header")).toBeNull();
		expect(menuPanel.querySelector("aside")?.className).toContain("safe-top");
		expect(menuPanel.querySelector("aside")?.className).toContain(
			"dark:bg-ios-950",
		);
		expect(menuPanel.querySelector("aside")?.className).not.toContain(
			"dark:bg-gradient",
		);
	});

	it("shows feed health summary in the mobile menu when sync props are provided", () => {
		const onRetryFailed = vi.fn();
		render(
			<Header
				syncStatus={{
					total: 2,
					current: 1,
					isSyncing: true,
					lastUpdated: Date.now(),
					errors: 1,
					videos: 10,
					state: "running",
					failedChannels: [
						{
							id: "UC_BAD",
							title: "Broken Channel",
							reason: "RSS feed failed with HTTP 404",
						},
					],
				}}
				cacheStatus={{
					hasCache: true,
					isStale: false,
					age: 5000,
					videoCount: 10,
				}}
				onRetryFailed={onRetryFailed}
			/>,
		);

		fireEvent.click(screen.getByTestId("mobile-menu-button"));

		expect(screen.getByText("Feed health")).toBeInTheDocument();
		expect(screen.getByText("Broken Channel")).toBeInTheDocument();
	});

	it("does not show feed health in the mobile menu when sync props are absent", () => {
		render(
			<Header
				syncStatus={{
					total: 2,
					current: 1,
					isSyncing: true,
					lastUpdated: Date.now(),
					errors: 1,
					videos: 10,
					state: "running",
					failedChannels: [
						{
							id: "UC_BAD",
							title: "Broken Channel",
							reason: "RSS feed failed with HTTP 404",
						},
					],
				}}
			/>,
		);

		fireEvent.click(screen.getByTestId("mobile-menu-button"));

		expect(screen.queryByText("Feed health")).not.toBeInTheDocument();
	});

	it("does not show the compact feed health panel while refresh is running", () => {
		const syncingStatus = {
			total: 2,
			current: 1,
			isSyncing: true,
			lastUpdated: Date.now(),
			errors: 0,
			videos: 10,
			state: "running" as const,
			failedChannels: [],
		};
		const { rerender } = render(<Header syncStatus={syncingStatus} />);

		expect(
			screen.queryByTestId("mobile-refresh-health-panel"),
		).not.toBeInTheDocument();
		expect(screen.queryByText("Refreshing 1/2")).not.toBeInTheDocument();
		expect(screen.queryByText(/Next refresh/i)).not.toBeInTheDocument();

		rerender(
			<Header
				syncStatus={{ ...syncingStatus, isSyncing: false, state: "idle" }}
			/>,
		);

		expect(
			screen.queryByTestId("mobile-refresh-health-panel"),
		).not.toBeInTheDocument();
	});

	it("can hide mobile search when the active view does not use channel search", () => {
		render(<Header showMobileSearch={false} />);

		expect(screen.queryAllByPlaceholderText("Search channels...")).toHaveLength(
			1,
		);
	});

	it("reveals mobile search only after tapping the search icon", () => {
		render(<Header searchPlaceholder="Search videos..." />);

		expect(screen.queryAllByPlaceholderText("Search videos...")).toHaveLength(
			1,
		);

		fireEvent.click(screen.getByTestId("mobile-search-button"));

		expect(screen.queryAllByPlaceholderText("Search videos...")).toHaveLength(
			2,
		);
	});
});
