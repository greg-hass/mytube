import { lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { Upload, Plus } from "lucide-react";

const OPMLUpload = lazy(() =>
	import("./OPMLUpload").then((module) => ({ default: module.OPMLUpload })),
);

interface FirstRunOnboardingProps {
	onAddChannel: () => void;
	onImportSuccess?: () => void;
}

export const FirstRunOnboarding = ({
	onAddChannel,
	onImportSuccess,
}: FirstRunOnboardingProps) => (
	<main
		data-testid="first-run-onboarding"
		className="mx-auto flex h-[calc(100dvh-var(--app-header-height))] max-w-lg flex-col items-center justify-center px-4 py-2"
	>
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4 }}
			className="w-full"
		>
			{/* Title */}
			<div className="mb-5 flex items-center gap-3">
				<img
					src="/icon-192.png"
					alt="MyTube"
					className="h-10 w-10 rounded-xl shadow-lg shadow-red-500/20"
				/>
				<h1 className="text-xl font-bold text-gray-950 dark:text-ios-50">
					MyTube
				</h1>
			</div>

			{/* Action Cards */}
			<div className="grid gap-2">
				<button
					type="button"
					onClick={onAddChannel}
					className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition-all active:scale-[0.98] dark:border-ios-800 dark:bg-ios-900"
				>
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-ios-800">
						<Plus className="h-5 w-5 text-gray-700 dark:text-ios-300" />
					</div>
					<div>
						<h3 className="text-sm font-semibold text-gray-900 dark:text-ios-100">
							Add a channel
						</h3>
						<p className="text-xs text-gray-500 dark:text-ios-400">
							Paste a YouTube URL, handle, or channel ID
						</p>
					</div>
				</button>

				<div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-ios-800 dark:bg-ios-900">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/20">
						<Upload className="h-5 w-5 text-red-600 dark:text-red-400" />
					</div>
					<div className="min-w-0 flex-1">
						<h3 className="text-sm font-semibold text-gray-900 dark:text-ios-100">
							Import subscriptions
						</h3>
						<p className="text-xs text-gray-500 dark:text-ios-400">
							Google Takeout CSV or OPML/XML
						</p>
					</div>
					<Suspense fallback={null}>
						<OPMLUpload minimal showLabelOnMobile onSuccess={onImportSuccess} />
					</Suspense>
				</div>
			</div>

			<p className="mt-4 text-center text-xs text-gray-400 dark:text-ios-600">
				Your feed refreshes automatically once channels are added.
			</p>
		</motion.div>
	</main>
);
