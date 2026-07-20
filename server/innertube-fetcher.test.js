import { createRequire } from "node:module";
import { describe, test, beforeAll, afterAll, afterEach, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const credsPath = path.join(__dirname, "data", "innertube-creds.json");
const credsBackupPath = path.join(
	__dirname,
	"data",
	"innertube-creds.json.test-backup",
);

const {
	isInnerTubeAvailable,
	parseDurationString,
	extractChannelId,
	extractChannelTitle,
	parseVideoRenderer,
	parseLockupViewModel,
	extractVideosFromResponse,
	extractContinuationToken,
	buildChannelMetadata,
	buildContext,
	MAX_SUBSCRIPTION_VIDEOS,
	SUBSCRIPTIONS_BROWSE_ID,
} = require("./innertube-fetcher");

describe("innertube-fetcher", () => {
	describe("isInnerTubeAvailable", () => {
		const origEnv = { ...process.env };
		let hadCredsFile = false;

		beforeAll(() => {
			if (fs.existsSync(credsPath)) {
				hadCredsFile = true;
				fs.renameSync(credsPath, credsBackupPath);
			}
		});

		afterAll(() => {
			if (hadCredsFile) {
				fs.renameSync(credsBackupPath, credsPath);
			}
		});

		afterEach(() => {
			process.env = { ...origEnv };
		});

		test("returns false when neither env var is set", () => {
			delete process.env.YOUTUBE_INNERTUBE_COOKIE;
			delete process.env.YOUTUBE_INNERTUBE_BEARER;
			expect(isInnerTubeAvailable()).toBe(false);
		});

		test("returns false when only cookie is set", () => {
			process.env.YOUTUBE_INNERTUBE_COOKIE = "test-cookie";
			delete process.env.YOUTUBE_INNERTUBE_BEARER;
			expect(isInnerTubeAvailable()).toBe(false);
		});

		test("returns true when cookie contains SAPISID", () => {
			process.env.YOUTUBE_INNERTUBE_COOKIE =
				"SAPISID=test-sapisid-value; SID=test-sid; other=stuff";
			expect(isInnerTubeAvailable()).toBe(true);
		});
	});

	describe("parseDurationString", () => {
		test("parses seconds-only", () => {
			expect(parseDurationString("45")).toBe(45);
		});

		test("parses minutes:seconds", () => {
			expect(parseDurationString("10:30")).toBe(630);
		});

		test("parses hours:minutes:seconds", () => {
			expect(parseDurationString("1:02:15")).toBe(3735);
		});

		test("returns null for invalid input", () => {
			expect(parseDurationString(null)).toBeNull();
			expect(parseDurationString("")).toBeNull();
			expect(parseDurationString("abc:def")).toBeNull();
		});
	});

	describe("extractChannelId", () => {
		test("extracts channelId from longBylineText", () => {
			const renderer = {
				longBylineText: {
					runs: [
						{
							text: "Test Channel",
							navigationEndpoint: {
								browseEndpoint: { browseId: "UCxxxxxxxxxxxx" },
							},
						},
					],
				},
			};
			expect(extractChannelId(renderer)).toBe("UCxxxxxxxxxxxx");
		});

		test("extracts channelId from ownerText", () => {
			const renderer = {
				ownerText: {
					runs: [
						{
							text: "Test Channel",
							navigationEndpoint: {
								browseEndpoint: { browseId: "UCabcdefghijklmnop" },
							},
						},
					],
				},
			};
			expect(extractChannelId(renderer)).toBe("UCabcdefghijklmnop");
		});

		test("returns null when no byline data", () => {
			expect(extractChannelId({})).toBeNull();
		});

		test("returns null when no UC browseId found", () => {
			const renderer = {
				longBylineText: {
					runs: [
						{
							text: "Test Channel",
							navigationEndpoint: {
								browseEndpoint: { browseId: "FEchannels" },
							},
						},
					],
				},
			};
			expect(extractChannelId(renderer)).toBeNull();
		});
	});

	describe("extractChannelTitle", () => {
		test("extracts title from longBylineText", () => {
			const renderer = {
				longBylineText: {
					runs: [{ text: "Awesome Channel" }],
				},
			};
			expect(extractChannelTitle(renderer)).toBe("Awesome Channel");
		});

		test("extracts title from simpleText", () => {
			const renderer = {
				ownerText: { simpleText: "Simple Channel" },
			};
			expect(extractChannelTitle(renderer)).toBe("Simple Channel");
		});

		test("returns Unknown when no byline", () => {
			expect(extractChannelTitle({})).toBe("Unknown");
		});
	});

	describe("parseVideoRenderer", () => {
		const validRenderer = {
			videoId: "abc123",
			title: { runs: [{ text: "Great Video" }] },
			publishedTimeText: { simpleText: "2 hours ago" },
			lengthText: { simpleText: "10:30" },
			longBylineText: {
				runs: [
					{
						text: "Test Channel",
						navigationEndpoint: {
							browseEndpoint: { browseId: "UCtest123" },
						},
					},
				],
			},
			thumbnail: {
				thumbnails: [
					{ url: "https://i.ytimg.com/vi/abc123/hqdefault.jpg", width: 480 },
				],
			},
			descriptionSnippet: { runs: [{ text: "A description" }] },
		};

		test("parses a complete video renderer", () => {
			const video = parseVideoRenderer(validRenderer);
			expect(video).not.toBeNull();
			expect(video.id).toBe("abc123");
			expect(video.title).toBe("Great Video");
			expect(video.channelId).toBe("UCtest123");
			expect(video.channelTitle).toBe("Test Channel");
			expect(video.duration).toBe(630);
			expect(video.description).toBe("A description");
			expect(video.fetchedVia).toBe("innertube");
			expect(video.publishedAt).toBeTruthy();
		});

		test("returns null when no videoId", () => {
			expect(
				parseVideoRenderer({ title: { runs: [{ text: "No ID" }] } }),
			).toBeNull();
		});

		test("returns null when no valid publishedTimeText", () => {
			const renderer = {
				...validRenderer,
				publishedTimeText: { simpleText: "invalid format" },
			};
			expect(parseVideoRenderer(renderer)).toBeNull();
		});

		test("marks as short when duration <= 61 seconds", () => {
			const renderer = {
				...validRenderer,
				lengthText: { simpleText: "0:45" },
			};
			const video = parseVideoRenderer(renderer);
			expect(video.isShort).toBe(true);
		});

		test("does not mark as short for normal videos", () => {
			const video = parseVideoRenderer(validRenderer);
			expect(video.isShort).toBeUndefined();
		});
	});

	describe("extractVideosFromResponse", () => {
		const sampleResponse = {
			contents: {
				twoColumnBrowseResultsRenderer: {
					tabs: [
						{
							tabRenderer: {
								content: {
									richGridRenderer: {
										contents: [
											{
												richItemRenderer: {
													content: {
														videoRenderer: {
															videoId: "vid1",
															title: { runs: [{ text: "Video 1" }] },
															publishedTimeText: { simpleText: "1 hour ago" },
															lengthText: { simpleText: "5:00" },
															longBylineText: {
																runs: [
																	{
																		text: "Channel A",
																		navigationEndpoint: {
																			browseEndpoint: { browseId: "UCaaa111" },
																		},
																	},
																],
															},
															thumbnail: {
																thumbnails: [
																	{ url: "https://example.com/v1.jpg" },
																],
															},
														},
													},
												},
											},
											{
												richItemRenderer: {
													content: {
														videoRenderer: {
															videoId: "vid2",
															title: { runs: [{ text: "Video 2" }] },
															publishedTimeText: { simpleText: "3 hours ago" },
															lengthText: { simpleText: "15:30" },
															longBylineText: {
																runs: [
																	{
																		text: "Channel B",
																		navigationEndpoint: {
																			browseEndpoint: { browseId: "UCbbb222" },
																		},
																	},
																],
															},
															thumbnail: {
																thumbnails: [
																	{ url: "https://example.com/v2.jpg" },
																],
															},
														},
													},
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
		};

		test("extracts all videos from a browse response", () => {
			const videos = extractVideosFromResponse(sampleResponse);
			expect(videos).toHaveLength(2);
			expect(videos[0].id).toBe("vid1");
			expect(videos[0].channelTitle).toBe("Channel A");
			expect(videos[1].id).toBe("vid2");
			expect(videos[1].channelTitle).toBe("Channel B");
		});

		test("deduplicates by videoId", () => {
			const dupResponse = {
				contents: {
					x: {
						videoRenderer: {
							videoId: "dup1",
							title: { runs: [{ text: "Dup" }] },
							publishedTimeText: { simpleText: "1 hour ago" },
							longBylineText: { runs: [{ text: "Ch" }] },
						},
					},
					y: {
						videoRenderer: {
							videoId: "dup1",
							title: { runs: [{ text: "Dup Again" }] },
							publishedTimeText: { simpleText: "1 hour ago" },
							longBylineText: { runs: [{ text: "Ch" }] },
						},
					},
				},
			};
			const videos = extractVideosFromResponse(dupResponse);
			expect(videos).toHaveLength(1);
		});

		test("returns empty array for empty response", () => {
			expect(extractVideosFromResponse({})).toEqual([]);
			expect(extractVideosFromResponse(null)).toEqual([]);
		});
	});

	describe("parseLockupViewModel", () => {
		const now = new Date("2026-07-20T10:00:00.000Z").getTime();

		function makeLockup({
			videoId = "abc123",
			title = "Test Video",
			channel = "Test Channel",
			channelId = "UCtest123",
			published = "8 minutes ago",
			durationText = "10:30",
			isLive = false,
		}) {
			return {
				contentId: videoId,
				contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
				contentImage: {
					thumbnailViewModel: {
						image: {
							sources: [
								{ url: "https://example.com/v1.jpg", width: 360 },
								{ url: "https://example.com/v2.jpg", width: 720 },
							],
						},
						overlays: [
							{
								thumbnailBottomOverlayViewModel: {
									badges: [
										{
											thumbnailBadgeViewModel: {
												text: isLive ? "LIVE" : durationText,
												badgeStyle: isLive
													? "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE"
													: "THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT",
												rendererContext: {
													accessibilityContext: {
														label: isLive ? "LIVE" : "10 minutes, 30 seconds",
													},
												},
											},
										},
									],
								},
							},
						],
					},
				},
				metadata: {
					lockupMetadataViewModel: {
						title: { content: title },
						image: {
							decoratedAvatarViewModel: {
								a11yLabel: `Go to channel ${channel}`,
							},
						},
						metadata: {
							contentMetadataViewModel: {
								metadataRows: [
									{
										metadataParts: [
											{
												text: {
													content: channel,
													commandRuns: [
														{
															onTap: {
																innertubeCommand: {
																	browseEndpoint: { browseId: channelId },
																},
															},
														},
													],
												},
											},
										],
									},
									{
										metadataParts: [
											{
												text: {
													content: `513 views | ${published}`,
												},
											},
										],
									},
								],
							},
						},
					},
				},
			};
		}

		test("parses a complete lockup view model", () => {
			const video = parseLockupViewModel(makeLockup({}), { now });
			expect(video).not.toBeNull();
			expect(video.id).toBe("abc123");
			expect(video.title).toBe("Test Video");
			expect(video.channelId).toBe("UCtest123");
			expect(video.channelTitle).toBe("Test Channel");
			expect(video.duration).toBe(630);
			expect(video.fetchedVia).toBe("innertube");
			expect(video.publishedAt).toBeTruthy();
		});

		test("returns null for missing contentId", () => {
			const lockup = makeLockup({});
			delete lockup.contentId;
			expect(parseLockupViewModel(lockup, { now })).toBeNull();
		});

		test("returns null for non-video lockups", () => {
			const lockup = makeLockup({});
			lockup.contentType = "LOCKUP_CONTENT_TYPE_PLAYLIST";
			expect(parseLockupViewModel(lockup, { now })).toBeNull();
		});

		test("handles live videos with no duration", () => {
			const video = parseLockupViewModel(makeLockup({ isLive: true }), { now });
			expect(video).not.toBeNull();
			expect(video.duration).toBeNull();
		});

		test("extracts relative time from multi-part metadata", () => {
			const video = parseLockupViewModel(
				makeLockup({ published: "Streamed 2 hours ago" }),
				{ now },
			);
			expect(video).not.toBeNull();
			expect(video.publishedAtSource).toBe("innertube-relative-time");
		});
	});

	describe("extractContinuationToken", () => {
		test("extracts token from continuationItemRenderer", () => {
			const data = {
				continuations: [
					{
						continuationItemRenderer: {
							continuationEndpoint: {
								continuationCommand: { token: "TOKEN123" },
							},
						},
					},
				],
			};
			expect(extractContinuationToken(data)).toBe("TOKEN123");
		});

		test("extracts token from button renderer", () => {
			const data = {
				items: [
					{
						continuationItemRenderer: {
							button: {
								buttonRenderer: {
									command: {
										continuationCommand: { token: "BUTTONTOKEN" },
									},
								},
							},
						},
					},
				],
			};
			expect(extractContinuationToken(data)).toBe("BUTTONTOKEN");
		});

		test("returns null when no token found", () => {
			expect(extractContinuationToken({})).toBeNull();
			expect(extractContinuationToken(null)).toBeNull();
		});
	});

	describe("buildChannelMetadata", () => {
		test("builds metadata for unique channels", () => {
			const videos = [
				{ channelId: "UC111", channelTitle: "Channel 1" },
				{ channelId: "UC222", channelTitle: "Channel 2" },
				{ channelId: "UC111", channelTitle: "Channel 1" },
			];
			const metadata = buildChannelMetadata(videos);
			expect(Object.keys(metadata)).toHaveLength(2);
			expect(metadata.UC111.title).toBe("Channel 1");
			expect(metadata.UC222.title).toBe("Channel 2");
		});

		test("returns empty object for empty videos", () => {
			expect(buildChannelMetadata([])).toEqual({});
		});
	});

	describe("buildContext", () => {
		test("returns minimal client context", () => {
			const ctx = buildContext();
			expect(ctx.client.clientName).toBe("WEB");
			expect(ctx.client.clientVersion).toBeTruthy();
			expect(ctx.client.platform).toBe("DESKTOP");
			expect(ctx.user.lockedSafetyMode).toBe(false);
		});

		test("respects hl/gl overrides", () => {
			process.env.YOUTUBE_INNERTUBE_HL = "en-US";
			process.env.YOUTUBE_INNERTUBE_GL = "US";
			const ctx = buildContext();
			expect(ctx.client.hl).toBe("en-US");
			expect(ctx.client.gl).toBe("US");
			delete process.env.YOUTUBE_INNERTUBE_HL;
			delete process.env.YOUTUBE_INNERTUBE_GL;
		});
	});

	describe("constants", () => {
		test("exports expected constants", () => {
			expect(SUBSCRIPTIONS_BROWSE_ID).toBe("FEsubscriptions");
			expect(MAX_SUBSCRIPTION_VIDEOS).toBeGreaterThan(0);
		});
	});
});
