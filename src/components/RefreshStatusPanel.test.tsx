import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RefreshStatusPanel } from "./RefreshStatusPanel";

describe("RefreshStatusPanel", () => {
	it("shows last refresh, next refresh, and cache age", () => {
		render(
			<RefreshStatusPanel
				status={{
					total: 47,
					current: 47,
					isSyncing: false,
					lastUpdated: new Date("2026-05-14T12:00:00.000Z").getTime(),
					errors: 0,
					videos: 120,
					state: "idle",
					failedChannels: [],
					scheduledRefresh: {
						enabled: true,
						intervalMs: 15 * 60 * 1000,
						lastRunAt: "2026-05-14T12:00:00.000Z",
						nextRunAt: "2026-05-14T12:15:00.000Z",
					},
				}}
				cacheStatus={{
					hasCache: true,
					isStale: false,
					age: 5 * 60 * 1000,
					videoCount: 120,
				}}
				onRetryFailed={vi.fn()}
			/>,
		);

		expect(screen.getByText(/Last refresh/i)).toBeInTheDocument();
		expect(screen.getByText(/Next refresh/i)).toBeInTheDocument();
		expect(screen.getByText(/Cache age/i)).toBeInTheDocument();
	});

	it("shows failed channels and calls retry", () => {
		const retry = vi.fn();
		render(
			<RefreshStatusPanel
				status={{
					total: 2,
					current: 2,
					isSyncing: false,
					lastUpdated: Date.now(),
					errors: 1,
					videos: 10,
					state: "error",
					failedChannels: [
						{
							id: "UC_FAIL",
							title: "Broken Channel",
							reason: "RSS feed failed with HTTP 404",
						},
					],
				}}
				cacheStatus={{
					hasCache: true,
					isStale: true,
					age: 2 * 24 * 60 * 60 * 1000,
					videoCount: 10,
				}}
				onRetryFailed={retry}
			/>,
		);

		expect(screen.getByText("Broken Channel")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /retry failed/i }));
		expect(retry).toHaveBeenCalledTimes(1);
	});

	it("shows failure reason when a channel feed fails", () => {
		render(
			<RefreshStatusPanel
				status={{
					total: 1,
					current: 1,
					isSyncing: false,
					lastUpdated: Date.now(),
					errors: 1,
					videos: 10,
					state: "error",
					failedChannels: [
						{
							id: "UC_FAIL",
							title: "Broken Channel",
							reason: "RSS feed failed with HTTP 404",
						},
					],
				}}
				cacheStatus={{
					hasCache: true,
					isStale: true,
					age: 60 * 60 * 1000,
					videoCount: 10,
				}}
				onRetryFailed={vi.fn()}
			/>,
		);

		expect(
			screen.getByText(/RSS feed failed with HTTP 404/i),
		).toBeInTheDocument();
	});
});
