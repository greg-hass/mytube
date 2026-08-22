/**
 * Stale-channel detection — computed client-side from the video archive.
 * A channel is stale when its newest archived video is older than the
 * threshold; channels with no archived videos are "unknown", not stale,
 * so they are never shown as dormant.
 */
import type { YouTubeChannel, YouTubeVideo } from "../types/youtube";

export const DEFAULT_STALE_CHANNEL_DAYS = 90;

export type LastUploadByChannel = Map<string, string>;

export function computeLastUploadByChannel(
	videos: YouTubeVideo[],
): LastUploadByChannel {
	const map: LastUploadByChannel = new Map();
	for (const video of videos) {
		if (!video?.channelId || !video.publishedAt) continue;
		const current = map.get(video.channelId);
		if (!current || video.publishedAt > current) {
			map.set(video.channelId, video.publishedAt);
		}
	}
	return map;
}

export function isStaleChannel(
	lastUploadAt: string | undefined,
	thresholdDays: number,
	now: number = Date.now(),
): boolean {
	if (!lastUploadAt) return false;
	const lastUploadTime = new Date(lastUploadAt).getTime();
	if (!Number.isFinite(lastUploadTime)) return false;
	return now - lastUploadTime >= thresholdDays * 24 * 60 * 60 * 1000;
}

/**
 * Channels that qualify as stale, stalest first. Channels without upload
 * data are excluded (unknown ≠ dormant).
 */
export function filterStaleChannels(
	channels: YouTubeChannel[],
	lastUploadByChannel: LastUploadByChannel,
	thresholdDays: number,
	now: number = Date.now(),
): YouTubeChannel[] {
	return channels
		.filter((channel) =>
			isStaleChannel(lastUploadByChannel.get(channel.id), thresholdDays, now),
		)
		.sort((a, b) => {
			const aTime = new Date(lastUploadByChannel.get(a.id) || "").getTime();
			const bTime = new Date(lastUploadByChannel.get(b.id) || "").getTime();
			return aTime - bTime;
		});
}

export function countChannelsWithoutUploadData(
	channels: YouTubeChannel[],
	lastUploadByChannel: LastUploadByChannel,
): number {
	return channels.filter((channel) => !lastUploadByChannel.has(channel.id))
		.length;
}
