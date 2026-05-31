const {
    pipedInstances: PIPED_INSTANCES,
    invidiousInstances: INVIDIOUS_INSTANCES,
} = require('../src/lib/external-services.json');

const SEARCH_TIMEOUT_MS = 4000;
const SEARCH_CACHE_MS = 30000;

const searchCache = new Map();

function getCacheKey(query) {
    return normalizeText(query);
}

function getCachedResults(query) {
    const key = getCacheKey(query);
    const cached = searchCache.get(key);
    if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_MS) {
        return cached.results;
    }
    return null;
}

function setCachedResults(query, results) {
    const key = getCacheKey(query);
    searchCache.set(key, { results, timestamp: Date.now() });
    // Clean old entries occasionally
    if (searchCache.size > 100) {
        const now = Date.now();
        for (const [k, v] of searchCache.entries()) {
            if (now - v.timestamp > SEARCH_CACHE_MS) {
                searchCache.delete(k);
            }
        }
    }
}

async function withTimeout(promise, ms, fallback = []) {
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve(fallback), ms);
    });
    return Promise.race([promise, timeoutPromise]);
}

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/^@/, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function scoreChannelResult(query, channel) {
    const normalizedQuery = normalizeText(query);
    const title = normalizeText(channel.title);
    const handle = normalizeText(channel.customUrl || channel.handle || '');
    const haystack = `${title} ${handle}`.trim();

    if (!normalizedQuery || !title) return 0;
    if (title === normalizedQuery || handle === normalizedQuery) return 100;
    if (title.startsWith(normalizedQuery) || handle.startsWith(normalizedQuery)) return 85;
    if (title.includes(normalizedQuery) || handle.includes(normalizedQuery)) return 70;

    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
    if (queryTokens.length === 0) return 0;

    const matchedTokens = queryTokens.filter(token => haystack.includes(token)).length;
    const tokenScore = Math.round((matchedTokens / queryTokens.length) * 60);
    const leadingTokenBonus = title.startsWith(queryTokens[0]) || handle.startsWith(queryTokens[0]) ? 15 : 0;

    return tokenScore + leadingTokenBonus;
}

function dedupeAndRankChannels(query, channels, limit = 8) {
    const byId = new Map();

    channels.forEach((channel) => {
        if (!channel?.id || !channel?.title) return;
        if (!channel.id.startsWith('UC')) return;

        const existing = byId.get(channel.id);
        if (!existing || scoreChannelResult(query, channel) > scoreChannelResult(query, existing)) {
            byId.set(channel.id, channel);
        }
    });

    return Array.from(byId.values())
        .map(channel => ({
            ...channel,
            score: scoreChannelResult(query, channel),
        }))
        .filter(channel => channel.score > 0)
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, limit);
}

function normalizeThumbnail(url) {
    if (!url || typeof url !== 'string') return '';
    if (url.startsWith('//')) return `https:${url}`;
    return url;
}

async function searchPipedChannels(query, fetchImpl = fetch) {
    const searches = PIPED_INSTANCES.map(async (instance) => {
        try {
            const response = await fetchImpl(`${instance}/search?q=${encodeURIComponent(query)}&filter=channels`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
            });

            if (!response.ok) return [];

            const data = await response.json();
            const items = Array.isArray(data?.items) ? data.items : [];

            return items.map(item => ({
                id: String(item.url || '').split('/').pop(),
                title: item.name,
                description: item.description || '',
                thumbnail: normalizeThumbnail(item.thumbnail),
                customUrl: item.url,
                subscriberCount: item.subscribers ? String(item.subscribers) : undefined,
            }));
        } catch (error) {
            console.warn(`Channel search failed for ${instance}:`, error.message);
            return [];
        }
    });

    const results = await Promise.all(searches);
    return results.flat();
}

async function searchInvidiousChannels(query, fetchImpl = fetch) {
    const searches = INVIDIOUS_INSTANCES.map(async (instance) => {
        try {
            const response = await fetchImpl(`${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=channel`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
            });

            if (!response.ok) return [];

            const data = await response.json();
            const items = Array.isArray(data) ? data : [];

            return items.map(item => ({
                id: item.authorId,
                title: item.author,
                description: item.description || '',
                thumbnail: normalizeThumbnail(item.authorThumbnails?.at(-1)?.url),
                customUrl: item.authorUrl,
                subscriberCount: item.subCount ? String(item.subCount) : undefined,
            }));
        } catch (error) {
            console.warn(`Channel search failed for ${instance}:`, error.message);
            return [];
        }
    });

    const results = await Promise.all(searches);
    return results.flat();
}

function parseYouTubeChannelSearchResults(html) {
    const results = [];
    const matches = String(html).matchAll(/"channelRenderer":\{"channelId":"(UC[^"]+)"([\s\S]*?)(?="channelRenderer"|"continuationItemRenderer"|"shelfRenderer"|<\/script>|$)/g);

    for (const match of matches) {
        const [, channelId, block] = match;
        const title = block.match(/"title":\{"simpleText":"([^"]+)"/)?.[1];
        if (!title) continue;

        const thumbnail = block.match(/"thumbnail":\{"thumbnails":\[[\s\S]*?\{"url":"([^"]+)"/)?.[1];
        const description = block.match(/"descriptionSnippet":\{"runs":\[\{"text":"([^"]+)"/)?.[1] || '';
        const customUrl = block.match(/"canonicalBaseUrl":"([^"]+)"/)?.[1];

        results.push({
            id: channelId,
            title,
            description,
            thumbnail: normalizeThumbnail(thumbnail),
            customUrl,
        });
    }

    return results;
}

async function searchYouTubePageChannels(query, fetchImpl = fetch) {
    try {
        const response = await fetchImpl(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAg%253D%253D`, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        if (!response.ok) return [];

        return parseYouTubeChannelSearchResults(await response.text());
    } catch (error) {
        console.warn('YouTube channel search scrape failed:', error.message);
        return [];
    }
}

async function searchChannels(query, options = {}) {
    const trimmedQuery = String(query || '').trim();
    if (trimmedQuery.length < 2) return [];

    // Check cache first
    const cached = getCachedResults(trimmedQuery);
    if (cached) return cached;

    const fetchImpl = options.fetchImpl || fetch;
    const limit = options.limit || 8;

    // Use allSettled with timeout so slow sources don't block fast ones
    const [youtubeResults, pipedResults, invidiousResults] = await Promise.all([
        withTimeout(searchYouTubePageChannels(trimmedQuery, fetchImpl), SEARCH_TIMEOUT_MS),
        withTimeout(searchPipedChannels(trimmedQuery, fetchImpl), SEARCH_TIMEOUT_MS),
        withTimeout(searchInvidiousChannels(trimmedQuery, fetchImpl), SEARCH_TIMEOUT_MS),
    ]);

    const allResults = [...youtubeResults, ...pipedResults, ...invidiousResults];
    const ranked = dedupeAndRankChannels(trimmedQuery, allResults, limit);
    
    // Cache the results
    setCachedResults(trimmedQuery, ranked);
    
    return ranked;
}

module.exports = {
    dedupeAndRankChannels,
    parseYouTubeChannelSearchResults,
    scoreChannelResult,
    searchChannels,
};
