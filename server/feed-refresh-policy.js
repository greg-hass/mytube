const CHANNEL_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function getFailureReason(result) {
	return result.errorStatus
		? `RSS feed failed with HTTP ${result.errorStatus}`
		: result.errorMessage || "No RSS videos or metadata returned";
}

function isFailedRefreshResult(result) {
	if (result.outcome) {
		return (
			result.outcome === "transient-failure" ||
			result.outcome === "permanent-failure"
		);
	}
	return (
		result.expected &&
		!result.channelMetadata &&
		(!result.videos || result.videos.length === 0)
	);
}

function summarizeFailedChannels(results = [], channelRefreshes = {}) {
	return results.filter(isFailedRefreshResult).map((result) => ({
		id: result.id,
		title: result.title || result.id,
		reason: getFailureReason(result),
		lastSuccessfulFetchAt:
			channelRefreshes[result.id]?.lastSuccessfulFetchAt || null,
	}));
}

function getChannelsDueForRefresh(subscriptions = []) {
	return subscriptions;
}

function parseBooleanEnv(value, defaultValue = true) {
	if (value === undefined || value === null || value === "")
		return defaultValue;
	return !["0", "false", "no", "off"].includes(
		String(value).trim().toLowerCase(),
	);
}

function parseRefreshIntervalMs(value) {
	const minutes = Number(value);
	if (!Number.isFinite(minutes) || minutes <= 0) {
		return DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS;
	}

	return Math.round(minutes * 60 * 1000);
}

function getScheduledRefreshConfig(env = process.env) {
	return {
		enabled: parseBooleanEnv(env.FEED_REFRESH_ENABLED, true),
		refreshOnStartup: parseBooleanEnv(env.FEED_REFRESH_ON_START, true),
		intervalMs: parseRefreshIntervalMs(env.FEED_REFRESH_INTERVAL_MINUTES),
	};
}

function getNextChannelsForRefresh(
	subscriptions = [],
	channelRefreshes = {},
	{ limit = 5 } = {},
) {
	const sorted = [...subscriptions].sort((a, b) => {
		const aLast = new Date(
			channelRefreshes[a.id]?.lastSuccessfulFetchAt || 0,
		).getTime();
		const bLast = new Date(
			channelRefreshes[b.id]?.lastSuccessfulFetchAt || 0,
		).getTime();
		return aLast - bLast;
	});
	return sorted.slice(0, Math.max(0, limit)).map((sub) => ({
		id: sub.id,
		title: sub.title,
		thumbnail: sub.thumbnail,
		lastSuccessfulFetchAt:
			channelRefreshes[sub.id]?.lastSuccessfulFetchAt || null,
	}));
}

function channelOutcome(channel) {
	if (isFailedRefreshResult(channel)) {
		return (
			channel.outcome ||
			(channel.transient ? "transient-failure" : "permanent-failure")
		);
	}
	return channel.outcome || "success";
}

function mergeChannelRefreshes(
	existingRefreshes = {},
	activeChannelIds = new Set(),
	fetchedChannels = [],
	fetchedAt = new Date().toISOString(),
) {
	const merged = {};

	for (const [channelId, refreshInfo] of Object.entries(
		existingRefreshes || {},
	)) {
		if (activeChannelIds.has(channelId)) {
			merged[channelId] = refreshInfo;
		}
	}

	for (const channel of fetchedChannels) {
		if (channel?.id && activeChannelIds.has(channel.id)) {
			const previous = merged[channel.id] || {};
			const failed = isFailedRefreshResult(channel);
			const source = channel.source || "rss";

			merged[channel.id] = {
				...previous,
				lastFetchedAt: fetchedAt,
				outcome: channelOutcome(channel),
				itemHash: channel.itemHash || previous.itemHash || null,
				...(channel.etag || previous.etag
					? { etag: channel.etag || previous.etag }
					: {}),
				...(channel.lastModified || previous.lastModified
					? { lastModified: channel.lastModified || previous.lastModified }
					: {}),
				lastError: failed ? getFailureReason(channel) : null,
				source,
				...(failed ? {} : { lastSuccessfulFetchAt: fetchedAt }),
			};
		}
	}

	return merged;
}

module.exports = {
	CHANNEL_REFRESH_INTERVAL_MS,
	DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS,
	getChannelsDueForRefresh,
	getNextChannelsForRefresh,
	getScheduledRefreshConfig,
	mergeChannelRefreshes,
	summarizeFailedChannels,
};
