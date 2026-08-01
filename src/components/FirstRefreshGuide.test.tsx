import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FirstRefreshGuide } from "./FirstRefreshGuide";

describe("FirstRefreshGuide", () => {
	it("explains the first refresh while it is pending", () => {
		render(
			<FirstRefreshGuide
				state="refreshing"
				isRefreshing
				onRefresh={vi.fn()}
				guideRef={{ current: null }}
			/>,
		);

		expect(screen.getByText("Checking your first channel")).toBeInTheDocument();
		expect(
			screen.getByText(/New uploads will appear in Latest, in strict chronological order/i),
		).toBeInTheDocument();
		expect(screen.getByText("You can keep browsing while this runs.")).toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("offers a retry when the first refresh returns no uploads", () => {
		const onRefresh = vi.fn();
		render(
			<FirstRefreshGuide
				state="empty"
				isRefreshing={false}
				onRefresh={onRefresh}
				guideRef={{ current: null }}
			/>,
		);

		expect(screen.getByText("No uploads found yet")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Retry first refresh" }));
		expect(onRefresh).toHaveBeenCalledTimes(1);
	});

	it("explains refresh errors without diagnosing the channel prematurely", () => {
		render(
			<FirstRefreshGuide
				state="error"
				isRefreshing={false}
				onRefresh={vi.fn()}
				guideRef={{ current: null }}
			/>,
		);

		expect(screen.getByText("First refresh needs attention")).toBeInTheDocument();
		expect(screen.getByText(/check the channel identity/i)).toBeInTheDocument();
	});
});
