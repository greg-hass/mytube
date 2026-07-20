import { Heart, Trash2, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDisplayThumbnail, handleImageLoadError } from "../lib/icon-loader";
import type { YouTubeChannel } from "../types/youtube";
import { groupCompactSubscriptions } from "./compact-subscriptions";

interface Props {
	channels: YouTubeChannel[];
	onRemove: (channelId: string) => void | Promise<void>;
	onToggleFavorite: (channelId: string) => void | Promise<void>;
	onToggleMute: (channelId: string) => void | Promise<void>;
}

export function CompactSubscriptionsList({
	channels,
	onRemove,
	onToggleFavorite,
	onToggleMute,
}: Props) {
	const navigate = useNavigate();
	const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
	const sections = groupCompactSubscriptions(channels);
	const showRail = channels.length >= 12 && sections.length >= 3;

	const jumpTo = (section: string) => {
		document
			.getElementById(
				`subscription-section-${section === "#" ? "other" : section}`,
			)
			?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	return (
		<div className="relative pb-8" data-testid="compact-subscriptions-list">
			<div className={showRail ? "pr-8" : ""}>
				{sections.map(([section, sectionChannels]) => (
					<section
						key={section}
						id={`subscription-section-${section === "#" ? "other" : section}`}
						className="scroll-mt-20"
					>
						<h2 className="sticky top-[var(--app-sticky-top)] z-10 border-y border-gray-200 bg-gray-50/95 px-2 py-1 text-xs font-semibold text-gray-500 backdrop-blur dark:border-ios-800 dark:bg-ios-950/95 dark:text-ios-400">
							{section}
						</h2>
						<ul className="divide-y divide-gray-200 dark:divide-ios-800">
							{sectionChannels.map((channel) => (
								<li key={channel.id}>
									<div className="flex min-h-14 items-center gap-3 px-2 py-2">
										<button
											type="button"
											onClick={() => navigate(`/channel/${channel.id}`)}
											className="flex min-w-0 flex-1 items-center gap-3 text-left"
										>
											<img
												src={getDisplayThumbnail(
													channel.thumbnail,
													channel.title || channel.id,
												)}
												alt=""
												className={`h-10 w-10 shrink-0 rounded-full object-cover ${channel.isMuted ? "grayscale opacity-50" : ""}`}
												onError={(event) =>
													handleImageLoadError(event, channel.id, channel.title)
												}
											/>
											<span className="min-w-0">
												<span className="block truncate text-sm font-medium text-gray-900 dark:text-ios-100">
													{channel.title}
												</span>
												{channel.customUrl && (
													<span className="block truncate text-xs text-gray-500 dark:text-ios-400">
														{channel.customUrl.startsWith("@")
															? channel.customUrl
															: `@${channel.customUrl}`}
													</span>
												)}
												{channel.group && (
													<span className="block truncate text-xs text-gray-500 dark:text-ios-400">
														{channel.group}
													</span>
												)}
											</span>
										</button>
										<button
											type="button"
											aria-pressed={Boolean(channel.isFavorite)}
											aria-label={
												channel.isFavorite
													? `Remove ${channel.title} from favorite channels`
													: `Add ${channel.title} to favorite channels`
											}
											onClick={() => onToggleFavorite(channel.id)}
											className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-ios-400 dark:hover:bg-ios-800"
										>
											<Heart
												className={`h-4 w-4 ${channel.isFavorite ? "fill-red-500 text-red-500" : ""}`}
											/>
										</button>
										<button
											type="button"
											aria-pressed={Boolean(channel.isMuted)}
											aria-label={
												channel.isMuted
													? `Unmute ${channel.title}`
													: `Mute ${channel.title}`
											}
											onClick={() => onToggleMute(channel.id)}
											className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-ios-400 dark:hover:bg-ios-800"
										>
											{channel.isMuted ? (
												<VolumeX className="h-4 w-4 text-red-500" />
											) : (
												<Volume2 className="h-4 w-4" />
											)}
										</button>
										{pendingRemoveId === channel.id ? (
											<span className="flex items-center gap-1">
												<span className="text-xs text-gray-500 dark:text-ios-400">
													Delete?
												</span>
												<button
													type="button"
													aria-label={`Confirm unsubscribe from ${channel.title}`}
													onClick={() => {
														setPendingRemoveId(null);
														onRemove(channel.id);
													}}
													className="rounded-lg px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
												>
													Confirm
												</button>
												<button
													type="button"
													aria-label={`Cancel unsubscribe from ${channel.title}`}
													onClick={() => setPendingRemoveId(null)}
													className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:text-ios-400 dark:hover:bg-ios-800"
												>
													Cancel
												</button>
											</span>
										) : (
											<button
												type="button"
												aria-label={`Unsubscribe from ${channel.title}`}
												title={`Unsubscribe from ${channel.title}`}
												onClick={() => setPendingRemoveId(channel.id)}
												className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-ios-400 dark:hover:bg-red-950/30"
											>
												<Trash2 className="h-4 w-4" />
											</button>
										)}
									</div>
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
			{showRail && (
				<nav
					aria-label="Jump to channel letter"
					className="fixed right-1 top-[calc(50%+3rem)] z-20 flex -translate-y-1/2 flex-col rounded-full bg-white/90 px-1 py-1 shadow dark:bg-ios-900/90"
				>
					{sections.map(([section]) => (
						<button
							key={section}
							type="button"
							onClick={() => jumpTo(section)}
							className="h-6 w-6 rounded-full text-[10px] font-semibold text-gray-500 hover:bg-red-600 hover:text-white dark:text-ios-400"
						>
							{section}
						</button>
					))}
				</nav>
			)}
		</div>
	);
}
