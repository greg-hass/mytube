import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PullToRefreshIndicator } from "./PullToRefreshIndicator";

describe("PullToRefreshIndicator", () => {
	it("renders nothing when idle", () => {
		const { container } = render(
			<PullToRefreshIndicator pullDistance={0} isRefreshing={false} />,
		);

		expect(container).toBeEmptyDOMElement();
	});

	it("disappears once the refresh starts — the progress card takes over", () => {
		const { container } = render(
			<PullToRefreshIndicator pullDistance={40} isRefreshing={true} />,
		);

		expect(container).toBeEmptyDOMElement();
	});

	it("shows a progress ring that fills, rotates and fades in with the pull", () => {
		const { container } = render(
			<PullToRefreshIndicator pullDistance={28} isRefreshing={false} />,
		);

		const ring = container.querySelectorAll("circle")[1];
		const circumference = 2 * Math.PI * 9;
		expect(Number(ring.getAttribute("stroke-dashoffset"))).toBeCloseTo(
			circumference * 0.5,
			3,
		);
		expect(container.querySelector("svg")?.style.transform).toContain(
			"rotate",
		);

		const chip = container.querySelector(".rounded-full") as HTMLElement;
		expect(chip.style.opacity).toBe("0.5");
	});

	it("sits above the content inside the translated feed container", () => {
		const { container } = render(
			<PullToRefreshIndicator pullDistance={28} isRefreshing={false} />,
		);

		const wrapper = container.firstElementChild as HTMLElement;
		expect(wrapper.className).toContain("absolute");
		expect(wrapper.className).not.toContain("fixed");
	});
});
