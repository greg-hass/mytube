/**
 * Native-style pull-to-refresh indicator: a progress ring that fills and
 * rotates with the pull distance (the hook already applies rubber-band
 * resistance), then snaps into a spinning loader once the pull is released
 * past the refresh threshold.
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
	if (pullDistance <= 0 && !isRefreshing) return null;

	const progress = Math.min(1, pullDistance / THRESHOLD);

	return (
		<div
			className="pointer-events-none fixed inset-x-0 top-[calc(var(--app-current-header-height)+0.25rem)] z-40 flex justify-center"
			aria-hidden="true"
		>
			<div
				className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-lg dark:bg-ios-900/95"
				style={{ transform: `translateY(${pullDistance * 0.35}px)` }}
			>
				{isRefreshing ? (
					<div className="w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
				) : (
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
				)}
			</div>
		</div>
	);
};
