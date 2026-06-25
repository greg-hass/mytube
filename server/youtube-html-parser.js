const CHANNEL_ID_PATTERN = /UC[a-zA-Z0-9_-]{22}/;
const OG_TITLE_PATTERN = /<meta property="og:title" content="([^"]+)"/;
const OG_IMAGE_PATTERN = /<meta property="og:image" content="([^"]+)"/;
const IMAGE_SRC_PATTERN = /<link rel="image_src" href="([^"]+)"/;
// YouTube's avatar JSON blob, which appears on channel pages.
const AVATAR_PATTERN =
	/"avatar":\{"thumbnails":\[\{"url":"(https:\/\/yt3\.googleusercontent\.com\/[^"]+)"/;

function isYouTubeHtmlParsingEnabled() {
	const value = process.env.YOUTUBE_HTML_PARSING_ENABLED;
	return value === undefined || value === "" || value.toLowerCase() === "true";
}

/**
 * Resize a YouTube avatar URL by rewriting the =sNNN size suffix.
 * YouTube serves the same image at multiple resolutions; requesting a
 * specific size avoids downloading a 900x900 image when 88x88 is enough.
 */
function resizeYouTubeAvatar(url, size) {
	if (!url || typeof url !== "string") return url;
	return url.replace(/=s\d+(-c-k-c0x[\da-f]+-no-rj)?$/, `=s${size}$1`);
}

function extractYouTubeChannelMetadata(html) {
	if (!isYouTubeHtmlParsingEnabled()) {
		return { channelId: null, title: null, avatar: null, disabled: true };
	}

	if (typeof html !== "string" || html.length === 0) {
		return { channelId: null, title: null, avatar: null };
	}

	let channelId = null;
	const canonical = html.match(/channel\/(UC[a-zA-Z0-9_-]{22})/);
	if (canonical && CHANNEL_ID_PATTERN.test(canonical[1])) {
		channelId = canonical[1];
	}

	if (!channelId) {
		const jsonMatch = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
		if (jsonMatch && CHANNEL_ID_PATTERN.test(jsonMatch[1])) {
			channelId = jsonMatch[1];
		}
	}

	let title = null;
	const titleMatch = html.match(OG_TITLE_PATTERN);
	if (titleMatch) {
		title = titleMatch[1];
	}

	// og:image is the channel's avatar at the page's default size.
	// We rewrite to =s176 (medium) for a balance of quality vs payload.
	let avatar = null;
	const ogImage =
		html.match(OG_IMAGE_PATTERN)?.[1] || html.match(IMAGE_SRC_PATTERN)?.[1];
	if (ogImage) {
		avatar = resizeYouTubeAvatar(ogImage, 176);
	} else {
		// Fallback: the avatar JSON blob inside the page's embedded data.
		const avatarJson = html.match(AVATAR_PATTERN)?.[1];
		if (avatarJson) {
			avatar = resizeYouTubeAvatar(avatarJson, 176);
		}
	}

	return { channelId, title, avatar };
}

module.exports = {
	extractYouTubeChannelMetadata,
	isYouTubeHtmlParsingEnabled,
	resizeYouTubeAvatar,
};
