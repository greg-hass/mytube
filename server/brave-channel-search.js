// Brave Search API as secondary channel discovery backend.
//
// Queries with a site:youtube.com filter, parses channel URLs from results,
// and resolves @handle → UC... channel ID via YouTube channels.list API
// (1 unit from the separate 10,000-unit/day pool — not the 100/day
// search.list bucket).
//
// Requires BRAVE_API_KEY for discovery.
// Requires YOUTUBE_API_KEY for handle resolution (results with
// /channel/UC... URLs don't need resolution and work without it).

const SEARCH_TIMEOUT_MS = 8000;

/**
 * Parse a YouTube URL and extract the channel identity from it.
 *
 * @param {string} url — a YouTube URL from Brave search results
 * @returns {{ type: "channel_id"|"handle"|"custom"|"user", value: string }|null}
 *   - "channel_id" — value is a UC... ID (no resolution needed)
 *   - "handle"     — value is an @handle (needs channels.list?forHandle=)
 *   - "custom"     — value is a legacy custom name (needs channels.list?forUsername=)
 *   - "user"       — value is a legacy username (needs channels.list?forUsername=)
 */
function parseYouTubeUrl(url) {
	if (!url || typeof url !== "string") return null;

	// youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx (22 chars after UC)
	let match = url.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
	if (match) return { type: "channel_id", value: match[1] };

	// youtube.com/@handle
	match = url.match(/youtube\.com\/@([\w.-]+)/i);
	if (match) return { type: "handle", value: match[1] };

	// youtube.com/c/customname
	match = url.match(/youtube\.com\/c\/([\w.-]+)/i);
	if (match) return { type: "custom", value: match[1] };

	// youtube.com/user/username (legacy)
	match = url.match(/youtube\.com\/user\/([\w.-]+)/i);
	if (match) return { type: "user", value: match[1] };

	return null;
}

/**
 * Resolve a handle/custom/user to a channel ID via YouTube Data API.
 * Uses channels.list?forHandle= or forUsername= (1 unit each).
 *
 * @returns {Promise<{id, title, description, thumbnail, customUrl}|null>}
 */
async function resolveChannelIdentity(identity, apiKey, fetchImpl, signal) {
	if (!apiKey) return null;

	const { type, value } = identity;
	let queryParam;

	if (type === "handle") {
		const param = value.startsWith("@") ? value : `@${value}`;
		queryParam = `forHandle=${encodeURIComponent(param)}`;
	} else {
		// "custom" and "user" both use forUsername
		queryParam = `forUsername=${encodeURIComponent(value)}`;
	}

	const url =
		`https://www.googleapis.com/youtube/v3/channels` +
		`?part=snippet&${queryParam}&key=${apiKey}`;

	try {
		const response = await fetchImpl(url, { signal });

		if (!response.ok) return null;

		const data = await response.json();
		const item = data?.items?.[0];
		if (!item) return null;

		return {
			id: item.id,
			title: item.snippet?.title || "",
			description: item.snippet?.description || "",
			thumbnail:
				item.snippet?.thumbnails?.medium?.url ||
				item.snippet?.thumbnails?.default?.url ||
				"",
			customUrl:
				type === "handle"
					? `/@${value.replace(/^@/, "")}`
					: item.snippet?.customUrl || undefined,
		};
	} catch (error) {
		if (error.name !== "AbortError") {
			console.warn("Channel identity resolution failed:", error.message);
		}
		return null;
	}
}

/**
 * Search for channels using Brave Search API.
 *
 * @param {string} query — the meaningful search query (e.g. "woodworking")
 * @param {object} options
 * @param {string} [options.braveKey] — override process.env.BRAVE_API_KEY
 * @param {string} [options.apiKey] — override process.env.YOUTUBE_API_KEY
 * @param {function} [options.fetchImpl] — override global fetch (for tests)
 * @returns {Promise<Array<{id, title, description, thumbnail, customUrl}>>}
 */
async function searchBraveChannels(query, options = {}) {
	const braveKey =
		options.braveKey !== undefined
			? options.braveKey
			: process.env.BRAVE_API_KEY;
	if (!braveKey) return [];

	const apiKey =
		options.apiKey !== undefined ? options.apiKey : process.env.YOUTUBE_API_KEY;

	const fetchImpl = options.fetchImpl || fetch;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

	try {
		// Target only channel-type URL paths — filters out videos/playlists
		// at the search level instead of wasting results on them
		const braveQuery =
			`${query} site:youtube.com/channel/` +
			` OR site:youtube.com/@` +
			` OR site:youtube.com/c/` +
			` OR site:youtube.com/user/`;
		const url =
			`https://api.search.brave.com/res/v1/web/search` +
			`?q=${encodeURIComponent(braveQuery)}` +
			`&count=20`;

		const response = await fetchImpl(url, {
			headers: {
				Accept: "application/json",
				"X-Subscription-Token": braveKey,
			},
			signal: controller.signal,
		});

		if (!response.ok) return [];

		const data = await response.json();
		const results = Array.isArray(data?.web?.results) ? data.web.results : [];

		// Parse YouTube URLs from Brave results
		const channels = [];
		const seenIds = new Set();
		const resolutionPromises = [];

		for (const result of results) {
			const identity = parseYouTubeUrl(result.url);
			if (!identity) continue;

			if (identity.type === "channel_id") {
				// Direct channel ID — no resolution needed
				if (seenIds.has(identity.value)) continue;
				seenIds.add(identity.value);

				channels.push({
					id: identity.value,
					title: result.title?.replace(/\s*[-–—]\s*YouTube\s*$/i, "") || "",
					description: result.description || "",
					thumbnail: "",
					customUrl: undefined,
				});
			} else {
				// Handle/custom/user — needs API resolution
				resolutionPromises.push(
					resolveChannelIdentity(
						identity,
						apiKey,
						fetchImpl,
						controller.signal,
					).then((resolved) => {
						if (resolved && !seenIds.has(resolved.id)) {
							seenIds.add(resolved.id);
							channels.push(resolved);
						}
					}),
				);
			}
		}

		// Wait for all handle resolutions in parallel
		await Promise.all(resolutionPromises);

		return channels;
	} catch (error) {
		if (error.name === "AbortError") {
			console.warn("Brave search timed out");
		} else {
			console.warn("Brave channel search failed:", error.message);
		}
		return [];
	} finally {
		clearTimeout(timeoutId);
	}
}

module.exports = {
	searchBraveChannels,
	parseYouTubeUrl,
	resolveChannelIdentity,
};
