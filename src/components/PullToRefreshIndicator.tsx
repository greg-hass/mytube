/**
 * Native-style pull-to-refresh indicator: a progress ring that fills and
 * rotates with the pull distance (the hook already applies rubber-band
 * resistance). Rendered inside the translated feed container so it travels
 * with the content, sitting in the gap the pull opens above it. Once the
 * refresh starts, the indicator disappears — the refresh progress card is
 * the ongoing feedback from that point on.
 */

const THRESHOLD = 56;
const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const PullToRefreshIndicator = ({
	pullDistance,
	isRefreshing,
}: {
	pullDistance: number;
	isRefreshing: boolean;
}) => {
	if (pullDistance <= 0 || isRefreshing) return null;

	const progress = Math.min(1, pullDistance / THRESHOLD);

	return (
		<div
			className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center"
			aria-hidden="true"
		>
			<div
				className="flex h-9 w-9 -translate-y-full items-center justify-center rounded-full bg-white/95 shadow-lg dark:bg-ios-900/95"
				style={{ opacity: progress }}
			>
				<svg
					viewBox="0 0 24 24"
					className="h-6 w-6"
					style={{ transform: `rotate(${pullDistance * 4 - 90}deg)` }}
				>
					<circle
						cx="12"
						cy="12"
						r={RADIUS}
						fill="none"
						strokeWidth="2.5"
						className="stroke-gray-200 dark:stroke-ios-700"
					/>
					<circle
						cx="12"
						cy="12"
						r={RADIUS}
						fill="none"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeDasharray={CIRCUMFERENCE}
						strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
						className="stroke-red-600"
					/>
				</svg>
			</div>
		</div>
	);
};
