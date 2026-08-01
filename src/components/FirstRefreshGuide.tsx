import { AlertTriangle, Clock3, Info, Loader2, RefreshCw } from "lucide-react";
import type { RefObject } from "react";

export type FirstRefreshState = "pending" | "refreshing" | "empty" | "error";

type FirstRefreshGuideProps = {
	state: FirstRefreshState;
	isRefreshing: boolean;
	onRefresh: () => void;
	guideRef: RefObject<HTMLElement | null>;
};

export function FirstRefreshGuide({
	state,
	isRefreshing,
	onRefresh,
	guideRef,
}: FirstRefreshGuideProps) {
	const isActive = state === "pending" || state === "refreshing";
	const isRetryable = state === "empty" || state === "error";
	const Icon =
		state === "error"
			? AlertTriangle
			: state === "empty"
				? Info
			: state === "refreshing"
					? Loader2
					: Clock3;
	const title =
		state === "error"
			? "First refresh needs attention"
			: state === "empty"
				? "No uploads found yet"
				: state === "refreshing"
					? "Checking your first channel"
					: "Preparing your first refresh";
	const detail =
		state === "error"
			? "The first RSS refresh finished with an error. Retry the feed; if it keeps failing, check the channel identity."
			: state === "empty"
				? "The first RSS refresh completed without recent uploads. Some channels publish infrequently, so try again later or retry the feed if you expected a new video."
				: "MyTube is checking the channel's RSS feed. New uploads will appear in Latest, in strict chronological order.";

	return (
		<section
			ref={guideRef}
			data-testid="first-refresh-guide"
			role="status"
			aria-live="polite"
			tabIndex={-1}
			aria-labelledby="first-refresh-guide-title"
			className="mb-5 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-4 dark:border-blue-900/60 dark:bg-blue-950/30"
		>
			<div className="flex items-start gap-3">
				<Icon
					aria-hidden="true"
					className={`mt-0.5 h-5 w-5 shrink-0 ${state === "error" ? "text-amber-600 dark:text-amber-300" : "text-blue-600 dark:text-blue-300"} ${state === "refreshing" ? "animate-spin" : ""}`}
				/>
				<div className="min-w-0 flex-1">
					<h2
						id="first-refresh-guide-title"
						className="text-sm font-semibold text-blue-950 dark:text-blue-100"
					>
						{title}
					</h2>
					<p className="mt-1 text-sm leading-5 text-blue-900 dark:text-blue-200">
						{detail}
					</p>
					{isRetryable && (
						<button
							type="button"
							onClick={onRefresh}
							disabled={isRefreshing}
							className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60 dark:bg-blue-500 dark:text-blue-950 dark:hover:bg-blue-400"
						>
							<RefreshCw className="h-4 w-4" />
							{isRefreshing ? "Retrying refresh..." : "Retry first refresh"}
						</button>
					)}
					{isActive && (
						<p className="mt-2 text-xs text-blue-800 dark:text-blue-300">
							You can keep browsing while this runs.
						</p>
					)}
				</div>
			</div>
		</section>
	);
}
