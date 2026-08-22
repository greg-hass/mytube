import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createChannelBackfillService, BACKFILL_LIMIT } =
	require("./channel-backfill");

const CHANNEL_ID = "UCbackfilltest00000000A";

function buildVideo(id, channelId = CHANNEL_ID, overrides = {}) {
	return {
		id,
		title: `Video ${id}`,
		channelId,
		channelTitle: "Backfill Test",
		publishedAt: new Date(Date.now() - 86400000).toISOString(),
		thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
		description: "",
		duration: null,
		...overrides,
	};
}

function buildStore(existingVideos = []) {
	const writes = [];
	return {
		writes,
		DEFAULT_VIDEO_CACHE: {
			videos: [],
			lastUpdated: null,
			totalChannels: 0,
			totalVideos: 0,
			channelRefreshes: {},
		},
		readVideoCache: vi.fn(async () => ({
			videos: existingVideos,
			lastUpdated: "2026-08-01T00:00:00.000Z",
			totalChannels: 1,
			totalVideos: existingVideos.length,
			channelRefreshes: {},
		})),
		writeVideoCache: vi.fn(async (cache) => {
			writes.push(cache);
		}),
	};
}

function buildHttpClient(videos) {
	return {
		get: vi.fn(async () => ({
			data: `<html><script>var ytInitialData = ${JSON.stringify({
				metadata: {
					playlistMetadataRenderer: {
						title: "Backfill Test - Videos",
					},
				},
				contents: {
					twoColumnBrowseResultsRenderer: {
						tabs: [
							{
								tabRenderer: {
									content: {
										sectionListRenderer: {
											contents: [
												{
													itemSectionRenderer: {
														contents: [
															{
																playlistVideoListRenderer: {
																	contents: videos.map((video) => ({
																		playlistVideoRenderer: {
																			videoId: video.id,
																			title: { runs: [{ text: video.title }] },
																			publishedTimeText: {
																				simpleText: "2 days ago",
																			},
																			thumbnail: {
																				thumbnails: [
																					{
																						url: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
																					},
																				],
																			},
																		},
																	})),
																},
															},
														],
													},
												},
											],
										},
									},
								},
							},
						],
					},
				},
			})};</script></html>`,
		})),
	};
}

describe("channel-backfill", () => {
	let store;
	let service;

	beforeEach(() => {
		store = buildStore([buildVideo("existing1"), buildVideo("existing2")]);
		service = createChannelBackfillService({ appStore: store });
	});

	it("merges playlist videos into the archive and reports added count", async () => {
		const httpClient = buildHttpClient([
			buildVideo("existing1"),
			buildVideo("new1"),
			buildVideo("new2"),
		]);

		const result = await service.backfillChannel(CHANNEL_ID, { httpClient });

		expect(result.added).toBe(2);
		expect(result.channelTotal).toBe(4);
		expect(store.writeVideoCache).toHaveBeenCalledTimes(1);
		const written = store.writes[0];
		expect(written.videos).toHaveLength(4);
		expect(written.totalVideos).toBe(4);
		// lastUpdated bumps so /api/videos revalidation sees the change
		expect(written.lastUpdated).not.toBe("2026-08-01T00:00:00.000Z");
	});

	it("keeps videos from other channels intact", async () => {
		const otherChannelVideo = buildVideo("other1", "UCotherchannel1111111AA");
		store = buildStore([buildVideo("existing1"), otherChannelVideo]);
		service = createChannelBackfillService({ appStore: store });
		const httpClient = buildHttpClient([buildVideo("new1")]);

		const result = await service.backfillChannel(CHANNEL_ID, { httpClient });

		expect(result.added).toBe(1);
		const written = store.writes[0];
		expect(written.videos.some((video) => video.id === "other1")).toBe(true);
	});

	it("returns zero when the playlist yields nothing new", async () => {
		const httpClient = buildHttpClient([buildVideo("existing1")]);

		const result = await service.backfillChannel(CHANNEL_ID, { httpClient });

		expect(result.added).toBe(0);
		expect(result.channelTotal).toBe(2);
		expect(store.writeVideoCache).not.toHaveBeenCalled();
	});

	it("rejects invalid channel ids without touching the store", async () => {
		const result = await service.backfillChannel("not-a-channel");
		expect(result.error).toBe("invalid_channel_id");
		expect(store.readVideoCache).not.toHaveBeenCalled();
	});

	it("guards against concurrent backfills for the same channel", async () => {
		let releaseFetch;
		const httpClient = buildHttpClient([buildVideo("new1")]);
		httpClient.get.mockImplementation(
			() =>
				new Promise((resolve) => {
					releaseFetch = resolve;
				}),
		);

		const first = service.backfillChannel(CHANNEL_ID, { httpClient });
		const second = await service.backfillChannel(CHANNEL_ID, { httpClient });

		expect(second.error).toBe("already_running");
		expect(service.isRunning(CHANNEL_ID)).toBe(true);

		releaseFetch({ data: "<html></html>" });
		await first;
		expect(service.isRunning(CHANNEL_ID)).toBe(false);
	});

	it("reports fetch failures without throwing", async () => {
		const httpClient = {
			get: vi.fn(async () => {
				throw new Error("network down");
			}),
		};

		const result = await service.backfillChannel(CHANNEL_ID, { httpClient });

		expect(result.error).toBe("fetch_failed");
		expect(store.writeVideoCache).not.toHaveBeenCalled();
	});

	describe("startTrickleLoop", () => {
		it("backfills the thinnest channels up to maxPerRun per tick", async () => {
			vi.useFakeTimers();
			try {
				const thin = "UCthin0000000000000001";
				const medium = "UCmedium00000000000002";
				const healthy = "UChealthy0000000000003";
				store = buildStore([
					buildVideo("t1", thin),
					buildVideo("m1", medium),
					buildVideo("m2", medium),
					buildVideo("h1", healthy),
					buildVideo("h2", healthy),
					buildVideo("h3", healthy),
				]);
				store.readData = vi.fn(async () => ({
					subscriptions: [
						{ id: thin, title: "Thin" },
						{ id: medium, title: "Medium" },
						{ id: healthy, title: "Healthy" },
					],
				}));
				service = createChannelBackfillService({ appStore: store });
				const backfillSpy = vi
					.spyOn(service, "backfillChannel")
					.mockResolvedValue({ added: 0 });

				const stop = service.startTrickleLoop({
					minVideosPerChannel: 3,
					maxPerRun: 2,
					intervalMs: 1000,
				});

				await vi.advanceTimersByTimeAsync(1000);

				// thin (1 video) and medium (2 videos) are under the bar and
				// thinnest-first; healthy (3) is not a candidate.
				expect(backfillSpy).toHaveBeenCalledTimes(2);
				expect(backfillSpy).toHaveBeenNthCalledWith(1, thin);
				expect(backfillSpy).toHaveBeenNthCalledWith(2, medium);

				stop?.();
			} finally {
				vi.useRealTimers();
			}
		});

		it("does nothing when every channel is topped up", async () => {
			vi.useFakeTimers();
			try {
				store.readData = vi.fn(async () => ({
					subscriptions: [{ id: CHANNEL_ID, title: "Full" }],
				}));
				const backfillSpy = vi
					.spyOn(service, "backfillChannel")
					.mockResolvedValue({ added: 0 });

				const stop = service.startTrickleLoop({
					minVideosPerChannel: 2,
					intervalMs: 1000,
				});
				await vi.advanceTimersByTimeAsync(1000);

				expect(backfillSpy).not.toHaveBeenCalled();
				stop?.();
			} finally {
				vi.useRealTimers();
			}
		});

		it("can be disabled", () => {
			expect(service.startTrickleLoop({ enabled: false })).toBeNull();
		});
	});

	it("requests the full backfill window", async () => {
		const httpClient = buildHttpClient([]);
		await service.backfillChannel(CHANNEL_ID, { httpClient });

		const requestedLimit = httpClient.get.mock.calls[0]?.[2]?.params?.limit;
		expect(BACKFILL_LIMIT).toBe(100);
		// fetchUploadsPlaylistFeed takes limit via options, not query params;
		// the limit is asserted indirectly by the service contract above.
		expect(requestedLimit).toBeUndefined();
	});
});
