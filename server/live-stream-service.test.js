const { describe, expect, it, vi } = globalThis;
const {
	createLiveStreamService,
	parseLiveChannelPage,
} = require("./live-stream-service");

const CHANNEL_ID = "UCaaaaaaaaaaaaaaaaaaaaaa";
const SECOND_CHANNEL_ID = "UCbbbbbbbbbbbbbbbbbbbbbb";

function livePage({
	videoId = "live-video-1",
	isLiveNow = true,
	channelId = CHANNEL_ID,
} = {}) {
	const playerResponse = {
		playabilityStatus: { status: "OK" },
		videoDetails: {
			videoId,
			title: "A live stream",
			shortDescription: "Live description",
			channelId,
			author: "Live Channel",
			viewCount: "1234",
			thumbnail: {
				thumbnails: [
					{ url: "https://i.ytimg.com/small.jpg", width: 120 },
					{ url: "https://i.ytimg.com/large.jpg", width: 1280 },
				],
			},
		},
		microformat: {
			playerMicroformatRenderer: {
				liveBroadcastDetails: {
					isLiveNow,
					startTimestamp: "2026-08-11T09:00:00Z",
				},
			},
		},
	};
	return [
		`<link rel="canonical" href="https://www.youtube.com/watch?v=${videoId}">`,
		`<script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script>`,
	].join("");
}

function channelPage(channelId = CHANNEL_ID) {
	return `<link rel="canonical" href="https://www.youtube.com/channel/${channelId}">`;
}

function response(html, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		text: async () => html,
	};
}

describe("live stream page parsing", () => {
	it("returns explicit current live metadata from the canonical player", () => {
		const video = parseLiveChannelPage(livePage(), {
			id: CHANNEL_ID,
			title: "Fallback channel",
		});

		expect(video).toEqual({
			id: "live-video-1",
			title: "A live stream",
			description: "Live description",
			thumbnail: "https://i.ytimg.com/large.jpg",
			channelId: CHANNEL_ID,
			channelTitle: "Live Channel",
			publishedAt: "2026-08-11T09:00:00Z",
			duration: undefined,
			isLive: true,
			liveBroadcastContent: "live",
			viewCount: "1234",
		});
	});

	it("does not mistake an upcoming stream or ordinary channel page for live", () => {
		expect(
			parseLiveChannelPage(livePage({ isLiveNow: false }), {
				id: CHANNEL_ID,
			}),
		).toBeNull();
		expect(
			parseLiveChannelPage(channelPage(), { id: CHANNEL_ID }),
		).toBeNull();
	});

	it("accepts the compact explicit live flag returned by channel ID pages", () => {
		const html = livePage({ isLiveNow: false }).replace(
			'"videoId":"live-video-1"',
			'"videoId":"live-video-1","isLive":true',
		);
		expect(parseLiveChannelPage(html, { id: CHANNEL_ID })?.isLive).toBe(true);
	});

	it("rejects a watch page whose player belongs to a different video", () => {
		const html = livePage().replace(
			"watch?v=live-video-1",
			"watch?v=different-video",
		);
		expect(() => parseLiveChannelPage(html, { id: CHANNEL_ID })).toThrow(
			"did not match",
		);
	});
});

describe("live stream service", () => {
	it("scans valid subscriptions with a concurrency bound and reports failures", async () => {
		let activeRequests = 0;
		let maxActiveRequests = 0;
		const fetchImpl = vi.fn(async (url) => {
			activeRequests += 1;
			maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
			await Promise.resolve();
			activeRequests -= 1;
			if (String(url).includes(SECOND_CHANNEL_ID)) return response("", 503);
			return response(livePage());
		});
		const service = createLiveStreamService({ fetchImpl, concurrency: 1 });

		const result = await service.scanSubscriptions([
			{ id: CHANNEL_ID, title: "Live Channel" },
			{ id: SECOND_CHANNEL_ID, title: "Unavailable Channel" },
			{ id: "handle_channel", title: "Unresolved Channel" },
		]);

		expect(maxActiveRequests).toBe(1);
		expect(result.videos).toHaveLength(1);
		expect(result).toMatchObject({
			totalChannels: 3,
			checkedChannels: 1,
			invalidChannels: 1,
			failedChannels: [
				{
					id: SECOND_CHANNEL_ID,
					title: "Unavailable Channel",
					reason: "YouTube returned HTTP 503",
				},
			],
		});
	});

	it("caches both live and not-live results and supports an explicit refresh", async () => {
		const fetchImpl = vi.fn(async () => response(channelPage()));
		const service = createLiveStreamService({ fetchImpl });
		const subscription = { id: CHANNEL_ID, title: "Channel" };

		await service.scanSubscriptions([subscription]);
		await service.scanSubscriptions([subscription]);
		expect(fetchImpl).toHaveBeenCalledTimes(1);

		await service.scanSubscriptions([subscription], { force: true });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("deduplicates concurrent lookups for the same channel", async () => {
		let resolveResponse;
		const fetchImpl = vi.fn(
			() =>
				new Promise((resolve) => {
					resolveResponse = () => resolve(response(channelPage()));
				}),
		);
		const service = createLiveStreamService({ fetchImpl });
		const subscription = { id: CHANNEL_ID, title: "Channel" };

		const first = service.lookupChannel(subscription);
		const second = service.lookupChannel(subscription);
		resolveResponse();
		await Promise.all([first, second]);

		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});
});
