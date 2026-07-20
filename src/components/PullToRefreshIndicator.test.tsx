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

	it("shows a progress ring that fills and rotates with the pull distance", () => {
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
		expect(container.querySelector(".animate-spin")).toBeNull();
	});

	it("snaps into a spinning loader once refreshing", () => {
		const { container } = render(
			<PullToRefreshIndicator pullDistance={0} isRefreshing={true} />,
		);

		expect(container.querySelector(".animate-spin")).not.toBeNull();
		expect(container.querySelector("svg")).toBeNull();
	});
});
