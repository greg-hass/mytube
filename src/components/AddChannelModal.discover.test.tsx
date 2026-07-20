import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AddChannelModal } from "./AddChannelModal";

vi.mock("framer-motion", () => ({
	AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
	motion: {
		div: ({
			animate,
			children,
			exit,
			initial,
			transition,
			whileHover,
			...props
		}: any) => {
			void animate;
			void exit;
			void initial;
			void transition;
			void whileHover;
			return <div {...props}>{children}</div>;
		},
		span: ({
			animate,
			children,
			exit,
			initial,
			transition,
			whileHover,
			...props
		}: any) => {
			void animate;
			void exit;
			void initial;
			void transition;
			void whileHover;
			return <span {...props}>{children}</span>;
		},
		section: ({
			animate,
			children,
			exit,
			initial,
			transition,
			whileHover,
			...props
		}: any) => {
			void animate;
			void exit;
			void initial;
			void transition;
			void whileHover;
			return <section {...props}>{children}</section>;
		},
	},
}));

vi.mock("../lib/youtube-api", () => ({
	fetchChannelInfoWithFallback: vi.fn(() => Promise.resolve(null)),
}));

const SUGGESTED_CHANNEL = {
	id: "UC9999999999999999999999",
	title: "Suggested Channel",
	description: "Picked for you",
	thumbnail: "https://example.com/suggested.jpg",
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("AddChannelModal — Discover Channels", () => {
	it("shows a busy button and skeleton rows while suggestions load", async () => {
		let resolveSuggestions: (value: unknown) => void = () => {};
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string | URL | Request) => {
				if (String(url).startsWith("/api/channel-suggestions")) {
					return new Promise((resolve) => {
						resolveSuggestions = resolve;
					});
				}
				return Promise.resolve({ ok: false, status: 404 });
			}),
		);

		render(<AddChannelModal isOpen onClose={vi.fn()} onAdd={vi.fn()} />);

		fireEvent.click(
			screen.getByRole("button", { name: /discover channels/i }),
		);

		// Busy button state
		const busyButton = screen.getByRole("button", {
			name: /discovering channels/i,
		});
		expect(busyButton).toBeDisabled();
		expect(busyButton).toHaveAttribute("aria-busy", "true");

		// Skeleton list loading state with shimmer overlay
		const loading = screen.getByTestId("discover-loading");
		expect(loading).toHaveTextContent("Discovering channels…");
		expect(
			loading.querySelectorAll(".bg-gradient-to-r").length,
		).toBe(3);

		resolveSuggestions({
			ok: true,
			json: () => Promise.resolve({ results: [SUGGESTED_CHANNEL] }),
		});

		await waitFor(() => {
			expect(screen.getByText("Suggested Channel")).toBeInTheDocument();
		});
		expect(screen.queryByTestId("discover-loading")).not.toBeInTheDocument();
	});
});
