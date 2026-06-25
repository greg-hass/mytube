import { motion } from "framer-motion";
import { Check, Plus } from "lucide-react";
import { formatSubscriberCount, formatVideoCount } from "./channelSearch";
import type { YouTubeChannel } from "../types/youtube";

interface AddChannelPreviewProps {
	channel: YouTubeChannel;
	isLoading: boolean;
	isAdded: boolean;
	onAdd: () => Promise<void>;
	onDismiss: () => void;
}

/**
 * Preview card for a single channel — used both for direct-identifier
 * results and for keyword-search results. Always wraps in a motion
 * section so the parent can mount it inside an AnimatePresence.
 */
export const AddChannelPreview = ({
	channel,
	isLoading,
	isAdded,
	onAdd,
	onDismiss,
}: AddChannelPreviewProps) => {
	const subscriberCount = formatSubscriberCount(channel.subscriberCount);
	const videoCount = formatVideoCount(channel.videoCount);

	return (
		<motion.section
			initial={{ opacity: 0, y: -4 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -4 }}
			className="rounded-b-xl border-x border-b border-gray-200 bg-white p-4 shadow-sm dark:border-ios-800 dark:bg-ios-900"
		>
			<h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
				<YoutubeIcon />
				Channel Preview
			</h3>
			<div className="flex items-start gap-3">
				<img
					src={
						channel.thumbnail ||
						`https://ui-avatars.com/api/?name=${encodeURIComponent(channel.title)}&background=random&color=fff`
					}
					alt={channel.title}
					className="w-16 h-16 rounded-full object-cover flex-none"
					onError={(event) => {
						event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(channel.title)}&background=random&color=fff`;
					}}
				/>
				<div className="flex-1 min-w-0">
					<h4 className="font-semibold text-gray-900 dark:text-ios-100">
						{channel.title}
					</h4>
					<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-ios-400">
						{subscriberCount && <span>{subscriberCount}</span>}
						{videoCount && <span>{videoCount}</span>}
						{channel.customUrl && <span>{channel.customUrl}</span>}
						<span className="font-mono">{channel.id}</span>
					</div>
					<p className="text-sm text-gray-600 dark:text-ios-300 mt-2">
						{channel.description ||
							"No description available from the search provider."}
					</p>
				</div>
			</div>
			<div className="mt-4 grid grid-cols-2 gap-2">
				<button
					type="button"
					onClick={onAdd}
					disabled={isLoading || isAdded}
					className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{isLoading ? (
						<span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
					) : isAdded ? (
						<Check className="h-4 w-4" />
					) : (
						<Plus className="h-4 w-4" />
					)}
					{isAdded ? "Added" : "Add"}
				</button>
				<button
					type="button"
					onClick={onDismiss}
					className="inline-flex h-11 items-center justify-center rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-800 ring-1 ring-gray-200 transition-colors hover:bg-gray-200 dark:bg-ios-800 dark:text-ios-100 dark:ring-ios-700 dark:hover:bg-ios-700"
				>
					Dismiss
				</button>
			</div>
		</motion.section>
	);
};

function YoutubeIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			className="w-4 h-4 text-red-600"
			aria-hidden="true"
			fill="currentColor"
		>
			<path d="M21.6 7.2c-.2-1-1-1.8-2-2C17.6 4.8 12 4.8 12 4.8s-5.6 0-7.6.4c-1 .2-1.8 1-2 2C2 9.2 2 12 2 12s0 2.8.4 4.8c.2 1 1 1.8 2 2 2 .4 7.6.4 7.6.4s5.6 0 7.6-.4c1-.2 1.8-1 2-2 .4-2 .4-4.8.4-4.8s0-2.8-.4-4.8zM10 15.4V8.6L15.8 12 10 15.4z" />
		</svg>
	);
}
