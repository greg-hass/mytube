import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePullToRefresh } from "./usePullToRefresh";

function touchEvent(
	type: "touchstart" | "touchmove" | "touchend",
	clientY?: number,
) {
	const event = new Event(type, {
		bubbles: true,
		cancelable: type === "touchmove",
	});
	Object.defineProperty(event, "touches", {
		value: clientY === undefined ? [] : [{ clientY }],
	});
	return event;
}

describe("usePullToRefresh", () => {
	afterEach(() => {
		Object.defineProperty(document.documentElement, "scrollTop", {
			configurable: true,
			value: 0,
		});
	});

	it("starts a refresh after a deliberate pull at the top of the page", () => {
		const onRefresh = vi.fn();
		renderHook(() =>
			usePullToRefresh({ isRefreshActive: false, onRefresh }),
		);

		act(() => {
			document.dispatchEvent(touchEvent("touchstart", 100));
			document.dispatchEvent(touchEvent("touchmove", 240));
			document.dispatchEvent(touchEvent("touchend"));
		});

		expect(onRefresh).toHaveBeenCalledTimes(1);
	});

	it("also starts when the pull begins on a channel link or action button", () => {
		const onRefresh = vi.fn();
		const channelButton = document.createElement("button");
		document.body.append(channelButton);
		renderHook(() =>
			usePullToRefresh({ isRefreshActive: false, onRefresh }),
		);

		act(() => {
			channelButton.dispatchEvent(touchEvent("touchstart", 100));
			channelButton.dispatchEvent(touchEvent("touchmove", 240));
			channelButton.dispatchEvent(touchEvent("touchend"));
		});

		channelButton.remove();
		expect(onRefresh).toHaveBeenCalledTimes(1);
	});

	it("does not start while the document is scrolled", () => {
		const onRefresh = vi.fn();
		Object.defineProperty(document.documentElement, "scrollTop", {
			configurable: true,
			value: 12,
		});
		renderHook(() =>
			usePullToRefresh({ isRefreshActive: false, onRefresh }),
		);

		act(() => {
			document.dispatchEvent(touchEvent("touchstart", 100));
			document.dispatchEvent(touchEvent("touchmove", 240));
			document.dispatchEvent(touchEvent("touchend"));
		});

		expect(onRefresh).not.toHaveBeenCalled();
	});
});
