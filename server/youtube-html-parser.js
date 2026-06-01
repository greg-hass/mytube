const CHANNEL_ID_PATTERN = /UC[a-zA-Z0-9_-]{22}/;
const OG_TITLE_PATTERN = /<meta property="og:title" content="([^"]+)"/;

function isYouTubeHtmlParsingEnabled() {
    const value = process.env.YOUTUBE_HTML_PARSING_ENABLED;
    return value === undefined || value === '' || value.toLowerCase() === 'true';
}

function extractYouTubeChannelMetadata(html) {
    if (!isYouTubeHtmlParsingEnabled()) {
        return { channelId: null, title: null, disabled: true };
    }

    if (typeof html !== 'string' || html.length === 0) {
        return { channelId: null, title: null };
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

    return { channelId, title };
}

module.exports = {
    extractYouTubeChannelMetadata,
    isYouTubeHtmlParsingEnabled,
};
