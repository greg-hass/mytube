import type { YouTubeChannel, YouTubeVideo } from "../types/youtube";

const DEFAULT_ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_ACTIVITY_LIMIT = 20;

export interface ChannelActivity {
	channel: YouTubeChannel;
	count: number;
	latestVideo: Date;
}

/**
 * Build the Activity tab's weekly channel summary from feed data.
 *
 * The input is deliberately treated as unordered: feed cache order is an
 * implementation detail, not an Activity ranking signal. Ties are resolved
 * by latest upload, title, then channel ID so the result is stable.
 */
export function getRecentChannelActivity(
	videos: readonly YouTubeVideo[],
	channels: readonly YouTubeChannel[],
	now = Date.now(),
	windowMs = DEFAULT_ACTIVITY_WINDOW_MS,
	limit = DEFAULT_ACTIVITY_LIMIT,
): ChannelActivity[] {
	const cutoff = now - windowMs;
	const channelById = new Map(channels.map((channel) => [channel.id, channel]));
	const activityByChannel = new Map<string, ChannelActivity>();

	for (const video of videos) {
		const publishedAt = Date.parse(video.publishedAt);
		if (!Number.isFinite(publishedAt) || publishedAt < cutoff || publishedAt > now) {
			continue;
		}

		const channel = channelById.get(video.channelId);
		if (!channel) continue;

		const existing = activityByChannel.get(video.channelId);
		if (existing) {
			existing.count += 1;
			if (publishedAt > existing.latestVideo.getTime()) {
				existing.latestVideo = new Date(publishedAt);
			}
			continue;
		}

		activityByChannel.set(video.channelId, {
			channel,
			count: 1,
			latestVideo: new Date(publishedAt),
		});
	}

	return Array.from(activityByChannel.values())
		.sort(
			(a, b) =>
				b.count - a.count ||
				b.latestVideo.getTime() - a.latestVideo.getTime() ||
				a.channel.title.localeCompare(b.channel.title) ||
				a.channel.id.localeCompare(b.channel.id),
		)
		.slice(0, limit);
}
