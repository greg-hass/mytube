import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
	extractYouTubeChannelMetadata,
	isYouTubeHtmlParsingEnabled,
} = require("./youtube-html-parser");

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
	process.env = { ...ORIGINAL_ENV };
});

describe("extractYouTubeChannelMetadata", () => {
	it("returns nulls for empty input", () => {
		expect(extractYouTubeChannelMetadata("")).toEqual({
			channelId: null,
			title: null,
			avatar: null,
		});
		expect(extractYouTubeChannelMetadata(null)).toEqual({
			channelId: null,
			title: null,
			avatar: null,
		});
	});

	it("extracts channelId from the canonical channel/UC... path", () => {
		const html =
			'<html><body><link rel="canonical" href="https://www.youtube.com/channel/UChnyfMqiRRG1u-2MsSQLbXA"></body></html>';
		expect(extractYouTubeChannelMetadata(html)).toEqual({
			channelId: "UChnyfMqiRRG1u-2MsSQLbXA",
			title: null,
			avatar: null,
		});
	});

	it("falls back to the JSON channelId field when the canonical link is missing", () => {
		const html =
			'<html><head><meta property="og:title" content="Veritasium"></head><body><script>{"channelId":"UChnyfMqiRRG1u-2MsSQLbXA"}</script></body></html>';
		expect(extractYouTubeChannelMetadata(html)).toEqual({
			channelId: "UChnyfMqiRRG1u-2MsSQLbXA",
			title: "Veritasium",
			avatar: null,
		});
	});

	it("returns title from og:title meta even when no channelId is present", () => {
		const html =
			'<html><head><meta property="og:title" content="Linux Channel"></head><body></body></html>';
		expect(extractYouTubeChannelMetadata(html)).toEqual({
			channelId: null,
			title: "Linux Channel",
			avatar: null,
		});
	});

	it("rejects malformed channel ids that do not match the UC pattern", () => {
		const html =
			'<html><body><a href="/channel/handle_evil">link</a></body></html>';
		expect(extractYouTubeChannelMetadata(html)).toEqual({
			channelId: null,
			title: null,
			avatar: null,
		});
	});

	it("respects the YOUTUBE_HTML_PARSING_ENABLED kill switch", () => {
		process.env.YOUTUBE_HTML_PARSING_ENABLED = "false";
		expect(isYouTubeHtmlParsingEnabled()).toBe(false);
		const html =
			'<html><body><link rel="canonical" href="https://www.youtube.com/channel/UChnyfMqiRRG1u-2MsSQLbXA"></body></html>';
		expect(extractYouTubeChannelMetadata(html)).toEqual({
			channelId: null,
			title: null,
			avatar: null,
			disabled: true,
		});
	});

	it("treats YOUTUBE_HTML_PARSING_ENABLED=true as enabled", () => {
		process.env.YOUTUBE_HTML_PARSING_ENABLED = "true";
		expect(isYouTubeHtmlParsingEnabled()).toBe(true);
	});

	it("extracts the avatar from og:image and resizes to medium", () => {
		const html =
			"<html><head>" +
			'<meta property="og:title" content="Veritasium" />' +
			'<meta property="og:image" content="https://yt3.googleusercontent.com/abc=s900-c-k-c0x00ffffff-no-rj" />' +
			"</head><body></body></html>";
		const result = extractYouTubeChannelMetadata(html);
		expect(result.avatar).toBe(
			"https://yt3.googleusercontent.com/abc=s176-c-k-c0x00ffffff-no-rj",
		);
	});

	it("falls back to image_src link when og:image is missing", () => {
		const html =
			"<html><head>" +
			'<link rel="image_src" href="https://yt3.googleusercontent.com/xyz=s900" />' +
			"</head><body></body></html>";
		const result = extractYouTubeChannelMetadata(html);
		expect(result.avatar).toBe("https://yt3.googleusercontent.com/xyz=s176");
	});

	it("falls back to the avatar JSON blob when meta tags are missing", () => {
		const html =
			"<html><body><script>" +
			'"avatar":{"thumbnails":[{"url":"https://yt3.googleusercontent.com/avatar123=s900-c-k-c0x00ffffff-no-rj"}]}' +
			"</script></body></html>";
		const result = extractYouTubeChannelMetadata(html);
		expect(result.avatar).toBe(
			"https://yt3.googleusercontent.com/avatar123=s176-c-k-c0x00ffffff-no-rj",
		);
	});

	it("returns avatar null when no image source is present", () => {
		const html =
			'<html><head><meta property="og:title" content="Linux Channel"></head><body></body></html>';
		const result = extractYouTubeChannelMetadata(html);
		expect(result.avatar).toBeNull();
	});
});

describe("resizeYouTubeAvatar", () => {
	const { resizeYouTubeAvatar } = require("./youtube-html-parser");

	it("rewrites the size suffix", () => {
		expect(
			resizeYouTubeAvatar("https://yt3.googleusercontent.com/abc=s900", 88),
		).toBe("https://yt3.googleusercontent.com/abc=s88");
	});

	it("preserves the crop/no-rj suffix when present", () => {
		expect(
			resizeYouTubeAvatar(
				"https://yt3.googleusercontent.com/abc=s900-c-k-c0x00ffffff-no-rj",
				176,
			),
		).toBe("https://yt3.googleusercontent.com/abc=s176-c-k-c0x00ffffff-no-rj");
	});

	it("returns the input unchanged when there is no size suffix", () => {
		expect(
			resizeYouTubeAvatar("https://yt3.googleusercontent.com/abc", 88),
		).toBe("https://yt3.googleusercontent.com/abc");
	});

	it("returns the input unchanged for null or empty", () => {
		expect(resizeYouTubeAvatar(null, 88)).toBeNull();
		expect(resizeYouTubeAvatar("", 88)).toBe("");
	});
});
