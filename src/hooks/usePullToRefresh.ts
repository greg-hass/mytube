import { useEffect, useState } from "react";

/**
 * Matches Feedy's mobile pull-to-refresh gesture: only starts at the top of
 * the page, ignores form controls, and requires a deliberate pull before
 * invoking the shared refresh controller.
 */
export function usePullToRefresh(deps: {
	isRefreshActive: boolean;
	onRefresh: () => void;
	onPullCancel?: () => void;
}) {
	const { isRefreshActive, onRefresh, onPullCancel } = deps;
	const [pullDistance, setPullDistance] = useState(0);

	useEffect(() => {
		let startY: number | null = null;
		let dragging = false;
		let latestDistance = 0;

		const reset = () => {
			startY = null;
			dragging = false;
			latestDistance = 0;
			setPullDistance(0);
		};

		const onTouchStart = (event: TouchEvent) => {
			if (window.scrollY > 4 || isRefreshActive) {
				reset();
				return;
			}

			const target = event.target as HTMLElement | null;
			if (target?.closest("input, textarea, select, button, a")) {
				reset();
				return;
			}

			startY = event.touches[0]?.clientY ?? null;
			dragging = false;
			latestDistance = 0;
		};

		const onTouchMove = (event: TouchEvent) => {
			if (startY == null || window.scrollY > 4 || isRefreshActive) return;

			const currentY = event.touches[0]?.clientY ?? startY;
			const delta = currentY - startY;
			if (delta <= 0) return;

			dragging = true;
			latestDistance = Math.min(88, Math.round(delta * 0.45));
			setPullDistance(latestDistance);
			event.preventDefault();
		};

		const finishDrag = () => {
			if (dragging && latestDistance >= 56 && !isRefreshActive) {
				onRefresh();
			} else if (dragging && !isRefreshActive) {
				onPullCancel?.();
			}

			const startDistance = latestDistance;
			startY = null;
			dragging = false;
			latestDistance = 0;

			if (startDistance <= 0) {
				setPullDistance(0);
				return;
			}

			const animationStart = performance.now();
			const animateBack = (now: number) => {
				const progress = Math.min(1, (now - animationStart) / 220);
				const eased = 1 - Math.pow(1 - progress, 3);
				setPullDistance(Math.round(startDistance * (1 - eased)));
				if (progress < 1) requestAnimationFrame(animateBack);
				else setPullDistance(0);
			};
			requestAnimationFrame(animateBack);
		};

		window.addEventListener("touchstart", onTouchStart, { passive: true });
		window.addEventListener("touchmove", onTouchMove, { passive: false });
		window.addEventListener("touchend", finishDrag, { passive: true });
		window.addEventListener("touchcancel", finishDrag, { passive: true });

		return () => {
			window.removeEventListener("touchstart", onTouchStart);
			window.removeEventListener("touchmove", onTouchMove);
			window.removeEventListener("touchend", finishDrag);
			window.removeEventListener("touchcancel", finishDrag);
		};
	}, [isRefreshActive, onPullCancel, onRefresh]);

	return { pullDistance };
}
