const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");
const { afterEach, beforeEach, describe, expect, it } = globalThis;
const { createSqliteStore } = require("./sqlite-store");
const { createApp } = require("./app-factory");

const TEST_TOKEN = "test-token";

function createTempDatabaseFile() {
	return path.join(
		fs.mkdtempSync(path.join(os.tmpdir(), "app-factory-test-")),
		"test.sqlite",
	);
}

function buildAppStore(databaseFile) {
	const store = createSqliteStore({
		databaseFile,
		legacyDataFile: path.join(path.dirname(databaseFile), "legacy-db.json"),
		legacyVideosFile: path.join(
			path.dirname(databaseFile),
			"legacy-videos.json",
		),
	});
	return {
		DEFAULT_DATA: {
			subscriptions: [],
			settings: {},
			watchedVideos: [],
			redirects: {},
		},
		DEFAULT_VIDEO_CACHE: {
			videos: [],
			lastUpdated: null,
			totalChannels: 0,
			totalVideos: 0,
			channelRefreshes: {},
		},
		getCurrentRevision: () => store.getRevision(),
		init: store.init,
		readData: store.readData,
		readVideoCache: store.readVideoCache,
		updateData: store.updateData,
		updateSubscriptionField: store.updateSubscriptionField,
		writeData: store.writeData,
		writeVideoCache: store.writeVideoCache,
		close: store.close,
	};
}

function buildFeedAggregatorStub(overrides = {}) {
	return {
		getAggregationStatus: () => ({
			running: false,
			queued: false,
			lastUpdated: null,
			totalChannels: 0,
		}),
		getActiveChannels: async () => [],
		aggregateFeeds: async () => {},
		start: () => {},
		stopScheduledRefresh: () => {},
		...overrides,
	};
}

function buildApp({
	databaseFile,
	apiKey = TEST_TOKEN,
	feedAggregator,
	config = {},
} = {}) {
	const appStore = buildAppStore(databaseFile);
	const aggregator = feedAggregator ?? buildFeedAggregatorStub();
	const result = createApp({
		appStore,
		feedAggregator: aggregator,
		config: {
			allowedOrigins: ["http://localhost:5173"],
			apiKey,
			allowInsecureUnauthenticatedApi: false,
			...config,
		},
	});
	return {
		app: result.app,
		appStore,
		aggregator,
		databaseFile,
		thumbnailRateLimiter: result.thumbnailRateLimiter,
	};
}

async function bootstrap(databaseFile) {
	const {
		app,
		appStore,
		aggregator,
		thumbnailRateLimiter,
		databaseFile: dbFile,
	} = buildApp({ databaseFile });
	await appStore.init({
		defaultData: appStore.DEFAULT_DATA,
		defaultVideoCache: appStore.DEFAULT_VIDEO_CACHE,
	});
	return {
		app,
		appStore,
		aggregator,
		thumbnailRateLimiter,
		databaseFile: dbFile,
	};
}

async function cleanup({ appStore, databaseFile }) {
	appStore.close();
	await fs.promises.rm(path.dirname(databaseFile), {
		recursive: true,
		force: true,
	});
}

function authedRequest(app) {
	const builder = {
		get: (path) =>
			request(app).get(path).set("Authorization", `Bearer ${TEST_TOKEN}`),
		post: (path) =>
			request(app).post(path).set("Authorization", `Bearer ${TEST_TOKEN}`),
		delete: (path) =>
			request(app).delete(path).set("Authorization", `Bearer ${TEST_TOKEN}`),
	};
	return builder;
}

describe("createApp integration", () => {
	let resources;
	beforeEach(async () => {
		resources = await bootstrap(createTempDatabaseFile());
	});
	afterEach(async () => {
		await cleanup(resources);
	});

	it("rejects requests without an API key", async () => {
		const response = await request(resources.app).get("/api/sync");
		expect(response.status).toBe(401);
	});

	it("GET /api/sync returns an ETag header and the current revision", async () => {
		const response = await authedRequest(resources.app).get("/api/sync");
		expect(response.status).toBe(200);
		expect(response.headers.etag).toBe('"1"');
		expect(response.body.subscriptions).toEqual([]);
		expect(response.body.redirects).toEqual({});
	});

	it("POST /api/sync without If-Match accepts the write and bumps the revision", async () => {
		const response = await authedRequest(resources.app)
			.post("/api/sync")
			.send({
				subscriptions: [
					{
						id: "UCaaaaaaaaaaaaaaaaaaaaaa",
						title: "One",
						thumbnail: "",
						description: "",
					},
				],
				settings: {},
				watchedVideos: [],
			});
		expect(response.status).toBe(200);
		expect(response.body.syncRevision).toBe(2);
		expect(response.headers.etag).toBe('"2"');
	});

	it("POST /api/sync with matching If-Match accepts the write", async () => {
		const initial = await authedRequest(resources.app).get("/api/sync");
		const etag = initial.headers.etag;
		const expectedRevision = initial.body.syncRevision + 1;

		const response = await authedRequest(resources.app)
			.post("/api/sync")
			.set("If-Match", etag)
			.send({ subscriptions: [], settings: {}, watchedVideos: [] });
		expect(response.status).toBe(200);
		expect(response.body.syncRevision).toBe(expectedRevision);
		expect(response.headers.etag).toBe(`"${expectedRevision}"`);
	});

	it("DELETE /api/subscriptions/:id removes the channel from the backend and tombstones it", async () => {
		const added = await authedRequest(resources.app)
			.post("/api/sync")
			.send({
				subscriptions: [
					{
						id: "UCaaaaaaaaaaaaaaaaaaaaaa",
						title: "Delete Me",
						thumbnail: "",
						description: "",
					},
				],
				settings: {},
				watchedVideos: [],
			});
		expect(added.status).toBe(200);

		const removed = await authedRequest(resources.app).delete(
			"/api/subscriptions/UCaaaaaaaaaaaaaaaaaaaaaa",
		);
		expect(removed.status).toBe(200);
		expect(removed.body.deletedId).toBe("UCaaaaaaaaaaaaaaaaaaaaaa");

		const afterDelete = await authedRequest(resources.app).get("/api/sync");
		expect(afterDelete.body.subscriptions).toEqual([]);
		expect(afterDelete.body.subscriptionTombstones).toEqual([
			expect.objectContaining({ id: "UCaaaaaaaaaaaaaaaaaaaaaa" }),
		]);

		const stalePush = await authedRequest(resources.app)
			.post("/api/sync")
			.send({
				subscriptions: [
					{
						id: "UCaaaaaaaaaaaaaaaaaaaaaa",
						title: "Delete Me",
						thumbnail: "",
						description: "",
					},
				],
				settings: {},
				watchedVideos: [],
			});
		expect(stalePush.status).toBe(200);

		const afterStalePush = await authedRequest(resources.app).get("/api/sync");
		expect(afterStalePush.body.subscriptions).toEqual([]);
		expect(afterStalePush.body.subscriptionTombstones).toEqual([
			expect.objectContaining({ id: "UCaaaaaaaaaaaaaaaaaaaaaa" }),
		]);
	});

	it("POST /api/sync with stale If-Match returns 412 and current ETag", async () => {
		const first = await authedRequest(resources.app)
			.post("/api/sync")
			.send({
				subscriptions: [{ id: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "One" }],
				settings: {},
				watchedVideos: [],
			});
		expect(first.status).toBe(200);

		const second = await authedRequest(resources.app)
			.post("/api/sync")
			.send({
				subscriptions: [{ id: "UCbbbbbbbbbbbbbbbbbbbbbb", title: "Two" }],
				settings: {},
				watchedVideos: [],
			});
		expect(second.status).toBe(200);
		const currentRevision = second.body.syncRevision;

		const stale = await authedRequest(resources.app)
			.post("/api/sync")
			.set("If-Match", '"0"')
			.send({
				subscriptions: [{ id: "UCcccccccccccccccccccccc", title: "Three" }],
				settings: {},
				watchedVideos: [],
			});
		expect(stale.status).toBe(412);
		expect(stale.body.error).toBe("Sync revision mismatch");
		expect(stale.body.currentRevision).toBe(currentRevision);
		expect(stale.headers.etag).toBe(`"${currentRevision}"`);

		const after = await authedRequest(resources.app).get("/api/sync");
		expect(after.body.subscriptions.map((s) => s.id)).toEqual([
			"UCbbbbbbbbbbbbbbbbbbbbbb",
		]);
	});

	it("POST /api/sync with malformed If-Match returns 400", async () => {
		const response = await authedRequest(resources.app)
			.post("/api/sync")
			.set("If-Match", '"abc"')
			.send({ subscriptions: [], settings: {}, watchedVideos: [] });
		expect(response.status).toBe(400);
	});

	it("POST /api/sync with negative If-Match returns 400", async () => {
		const response = await authedRequest(resources.app)
			.post("/api/sync")
			.set("If-Match", "-1")
			.send({ subscriptions: [], settings: {}, watchedVideos: [] });
		expect(response.status).toBe(400);
	});

	it("GET /api/health reports rate-limit bucket stats and search cache stats", async () => {
		const response = await authedRequest(resources.app).get("/api/health");
		expect(response.status).toBe(200);
		expect(response.body.rateLimitBuckets).toBeDefined();
		expect(response.body.searchCache).toBeDefined();
	});

	it("GET /api/videos/status includes activeChannels from the aggregator", async () => {
		const active = [
			{
				id: "UCaaaaaaaaaaaaaaaaaaaaaa",
				title: "Active",
				lastSuccessfulFetchAt: null,
				inFlightSince: null,
				lastError: null,
			},
		];
		const { app, appStore, databaseFile } = buildApp({
			databaseFile: createTempDatabaseFile(),
			feedAggregator: buildFeedAggregatorStub({
				getActiveChannels: async () => active,
			}),
		});
		await appStore.init({
			defaultData: appStore.DEFAULT_DATA,
			defaultVideoCache: appStore.DEFAULT_VIDEO_CACHE,
		});
		try {
			const response = await authedRequest(app).get(
				"/api/videos/status?limit=10",
			);
			expect(response.status).toBe(200);
			expect(response.body.activeChannels).toEqual(active);
		} finally {
			appStore.close();
			await fs.promises.rm(path.dirname(databaseFile), {
				recursive: true,
				force: true,
			});
		}
	});

	it("GET /api/videos/status clamps the limit to the configured maximum", async () => {
		let receivedLimit = null;
		const { app, appStore, databaseFile } = buildApp({
			databaseFile: createTempDatabaseFile(),
			feedAggregator: buildFeedAggregatorStub({
				getActiveChannels: async ({ limit }) => {
					receivedLimit = limit;
					return [];
				},
			}),
		});
		await appStore.init({
			defaultData: appStore.DEFAULT_DATA,
			defaultVideoCache: appStore.DEFAULT_VIDEO_CACHE,
		});
		try {
			await authedRequest(app).get("/api/videos/status?limit=999");
			expect(receivedLimit).toBe(50);
		} finally {
			appStore.close();
			await fs.promises.rm(path.dirname(databaseFile), {
				recursive: true,
				force: true,
			});
		}
	});

	it("POST /api/videos/refresh returns a refresh id and joins active work", async () => {
		const refreshPromise = Promise.resolve();
		const { app, appStore, databaseFile } = buildApp({
			databaseFile: createTempDatabaseFile(),
			feedAggregator: buildFeedAggregatorStub({
				requestRefresh: () => ({
					refreshId: "refresh-123",
					reused: true,
					promise: refreshPromise,
				}),
				getAggregationStatus: () => ({ current: 2, total: 4 }),
			}),
		});
		await appStore.init({
			defaultData: appStore.DEFAULT_DATA,
			defaultVideoCache: appStore.DEFAULT_VIDEO_CACHE,
		});
		try {
			const response = await authedRequest(app).post("/api/videos/refresh");
			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				success: true,
				refreshId: "refresh-123",
				reused: true,
				current: 2,
				total: 4,
				queued: 2,
				skipped: 0,
			});
		} finally {
			appStore.close();
			await fs.promises.rm(path.dirname(databaseFile), {
				recursive: true,
				force: true,
			});
		}
	});

	it("rejects cross-origin requests when the request Origin is not in the allowlist", async () => {
		const response = await authedRequest(resources.app)
			.get("/api/sync")
			.set("Origin", "https://evil.example.com");
		expect(response.status).toBe(403);
	});

	it("accepts same-origin requests from the allowlist", async () => {
		const response = await authedRequest(resources.app)
			.get("/api/sync")
			.set("Origin", "http://localhost:5173");
		expect(response.status).toBe(200);
	});

	it("GET /api/healthz is reachable without authentication", async () => {
		const response = await request(resources.app).get("/api/healthz");
		expect(response.status).toBe(200);
		expect(response.body).toEqual({ status: "ok" });
	});

	it("GET /api/videos returns an ETag and 304 on matching If-None-Match", async () => {
		await resources.appStore.writeVideoCache({
			...resources.appStore.DEFAULT_VIDEO_CACHE,
			videos: [
				{
					id: "vid-1",
					channelId: "UC123",
					publishedAt: "2026-06-22T10:00:00.000Z",
					title: "Video",
				},
			],
			lastUpdated: "2026-06-22T12:00:00.000Z",
			totalChannels: 1,
			totalVideos: 1,
		});

		const first = await request(resources.app)
			.get("/api/videos")
			.set("Authorization", `Bearer ${TEST_TOKEN}`);
		expect(first.status).toBe(200);
		expect(first.headers.etag).toBe('"2026-06-22T12:00:00.000Z"');

		const cached = await request(resources.app)
			.get("/api/videos")
			.set("Authorization", `Bearer ${TEST_TOKEN}`)
			.set("If-None-Match", first.headers.etag);
		expect(cached.status).toBe(304);
	});
});
