// On-demand channel backfill for the channel view.
//
// Routine refreshes stay RSS-first (YouTube RSS only serves the latest 15
// videos per channel), so recently-added subscriptions show a thin list.
// When the user asks for more, this service scrapes the channel's uploads
// playlist page once — its ytInitialData carries roughly 100 videos in a
// single request — and merges the result into the video archive through
// the same mergeVideoArchive path a normal refresh uses. Backfilled
// videos persist, so watched state and future refreshes keep working.

const { fetchUploadsPlaylistFeed } = require("./feed-fetcher");
const { mergeVideoArchive } = require("./video-archive");
const logger = require("./logger");

const BACKFILL_LIMIT = 100;
const MAX_ARCHIVED_VIDEOS = Number(process.env.MAX_ARCHIVED_VIDEOS) || 5000;

function createChannelBackfillService({ appStore }) {
	const inFlightChannels = new Set();

	async function backfillChannel(channelId, options = {}) {
		if (
			!channelId ||
			typeof channelId !== "string" ||
			!/^UC[\w-]{2,}$/.test(channelId)
		) {
			return { error: "invalid_channel_id" };
		}
		if (inFlightChannels.has(channelId)) {
			return { error: "already_running" };
		}

		inFlightChannels.add(channelId);
		try {
			const existingCache = await appStore.readVideoCache(
				appStore.DEFAULT_VIDEO_CACHE,
			);
			const existingVideos = existingCache.videos || [];
			const existingIds = new Set(
				existingVideos
					.filter((video) => video?.channelId === channelId)
					.map((video) => video.id),
			);

			const fetched = await fetchUploadsPlaylistFeed(
				channelId,
				options.httpClient,
				{ limit: options.limit || BACKFILL_LIMIT },
			);
			if (!fetched?.videos?.length) {
				return { added: 0, channelTotal: existingIds.size };
			}

			// activeChannelIds: null keeps videos for every channel — a backfill
			// for one channel must never evict the others from the archive.
			const { videos: keptVideos } = mergeVideoArchive(
				existingVideos,
				fetched.videos,
				{
					activeChannelIds: null,
					maxVideos: MAX_ARCHIVED_VIDEOS,
					cacheUpdatedAt: existingCache.lastUpdated,
				},
			);

			const channelCountAfter = keptVideos.filter(
				(video) => video?.channelId === channelId,
			).length;
			const added = Math.max(0, channelCountAfter - existingIds.size);

			if (added === 0) {
				// Nothing new — leave the cache (and its ETag) untouched.
				return { added: 0, channelTotal: existingIds.size };
			}

			await appStore.writeVideoCache({
				...existingCache,
				videos: keptVideos,
				lastUpdated: new Date().toISOString(),
				totalVideos: keptVideos.length,
			});

			logger.info(
				`📥 Backfilled ${added} videos for ${channelId} (${channelCountAfter} total for channel)`,
			);

			return { added, channelTotal: channelCountAfter };
		} catch (error) {
			logger.error(`Channel backfill failed for ${channelId}:`, error);
			return { error: "fetch_failed", message: error.message };
		} finally {
			inFlightChannels.delete(channelId);
		}
	}

	return {
		backfillChannel,
		isRunning: (channelId) => inFlightChannels.has(channelId),
	};
}

module.exports = {
	BACKFILL_LIMIT,
	createChannelBackfillService,
};
