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
const DEFAULT_TRICKLE_MIN_VIDEOS = 15;
const DEFAULT_TRICKLE_MAX_PER_RUN = 2;

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

	/**
	 * Periodically top up channels whose archived video count has fallen
	 * below `minVideosPerChannel` — at most `maxPerRun` playlist fetches per
	 * tick so the trickle never becomes a scrape burst. Self-terminates
	 * (one cheap store read per tick) once every channel is topped up.
	 */
	function startTrickleLoop(options = {}) {
		const enabled =
			options.enabled ??
			(process.env.BACKFILL_TRICKLE_ENABLED || "true").toLowerCase() !== "false";
		if (!enabled) {
			logger.info("⏭️ Backfill trickle disabled by BACKFILL_TRICKLE_ENABLED");
			return null;
		}

		const minVideosPerChannel =
			options.minVideosPerChannel ??
			(Number(process.env.BACKFILL_TRICKLE_MIN_VIDEOS) ||
				DEFAULT_TRICKLE_MIN_VIDEOS);
		const maxPerRun =
			options.maxPerRun ??
			(Number(process.env.BACKFILL_TRICKLE_MAX_PER_RUN) ||
				DEFAULT_TRICKLE_MAX_PER_RUN);
		const intervalMs =
			options.intervalMs ??
			(Number(process.env.BACKFILL_TRICKLE_INTERVAL_MINUTES) || 15) * 60_000;

		let tickRunning = false;
		const timer = setInterval(async () => {
			if (tickRunning) return;
			tickRunning = true;
			try {
				const [data, videoCache] = await Promise.all([
					appStore.readData(appStore.DEFAULT_DATA),
					appStore.readVideoCache(appStore.DEFAULT_VIDEO_CACHE),
				]);
				const counts = new Map();
				for (const video of videoCache.videos || []) {
					if (!video?.channelId) continue;
					counts.set(video.channelId, (counts.get(video.channelId) || 0) + 1);
				}
				const candidates = (data.subscriptions || [])
					.filter(
						(subscription) =>
							subscription?.id?.startsWith("UC") &&
							(counts.get(subscription.id) || 0) < minVideosPerChannel,
					)
					// Thinnest archives first so the trickle concentrates where it
					// matters most.
					.sort((a, b) => (counts.get(a.id) || 0) - (counts.get(b.id) || 0));
				for (const subscription of candidates.slice(0, maxPerRun)) {
					// Call through the service object so tests can observe/spy.
					await service.backfillChannel(subscription.id);
				}
			} catch (error) {
				logger.error("Backfill trickle tick failed:", error.message || error);
			} finally {
				tickRunning = false;
			}
		}, intervalMs);

		// The trickle must never keep the process alive on its own.
		timer.unref?.();
		logger.info(
			`💧 Backfill trickle armed: topping up to ${minVideosPerChannel} videos, max ${maxPerRun}/run, every ${Math.round(intervalMs / 60000)}min`,
		);
		return () => clearInterval(timer);
	}

	const service = {
		backfillChannel,
		isRunning: (channelId) => inFlightChannels.has(channelId),
		startTrickleLoop,
	};
	return service;
}

module.exports = {
	BACKFILL_LIMIT,
	createChannelBackfillService,
};
