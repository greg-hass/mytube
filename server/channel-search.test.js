import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    buildChannelSearchQueries,
    dedupeAndRankChannels,
    getSearchCacheStats,
    parseYouTubeChannelSearchResults,
    scoreChannelResult,
    searchChannels,
} = require('./channel-search');

describe('channel search ranking', () => {
    it('builds YouTube-style query variants for natural language channel search', () => {
        expect(buildChannelSearchQueries('Level One Techs')).toEqual([
            'levelt',
            '@levelt',
            'levelonetechs',
            'Level One Techs',
            'level one techs',
            'Level One Techs channel',
        ]);
    });

    it('ranks exact and token matches above weak matches', () => {
        const results = dedupeAndRankChannels('linux tech', [
            { id: 'UC_WEAK________________', title: 'Cooking Tech' },
            { id: 'UC_EXACT_______________', title: 'Linux Tech' },
            { id: 'UC_TOKEN_______________', title: 'Linux News and Tutorials' },
        ]);

        expect(results.map(result => result.title)).toEqual([
            'Linux Tech',
            'Linux News and Tutorials',
            'Cooking Tech',
        ]);
    });

    it('ignores non-channel ids and unmatchable results', () => {
        const results = dedupeAndRankChannels('linux', [
            { id: 'video-id', title: 'Linux Video' },
            { id: 'UC_VALID______________', title: 'Linux Channel' },
            { id: 'UC_OTHER______________', title: 'Cooking Channel' },
        ]);

        expect(results.map(result => result.id)).toEqual(['UC_VALID______________']);
    });

    it('scores handles as searchable text', () => {
        expect(scoreChannelResult('level1techs', {
            id: 'UC1234567890123456789012',
            title: 'Level One Techs',
            customUrl: '/channel/level1techs',
        })).toBeGreaterThan(60);
    });

    it('scores compact natural language matches against channel names', () => {
        expect(scoreChannelResult('level one techs', {
            id: 'UC1234567890123456789012',
            title: 'Level1Techs',
            customUrl: '/@level1techs',
        })).toBeGreaterThan(60);
    });

    it('parses channel results from YouTube search markup', () => {
        const results = parseYouTubeChannelSearchResults(`
            "channelRenderer":{"channelId":"UCHnyfMqiRRG1u-2MsSQLbXA","title":{"simpleText":"Veritasium"},"thumbnail":{"thumbnails":[{"url":"//yt3.ggpht.com/avatar=s88-c-k-c0x00ffffff-no-rj","width":88,"height":88}]},"descriptionSnippet":{"runs":[{"text":"Science videos"}]},"navigationEndpoint":{"browseEndpoint":{"canonicalBaseUrl":"/@veritasium"}}}
        `);

        expect(results).toEqual([
            {
                id: 'UCHnyfMqiRRG1u-2MsSQLbXA',
                title: 'Veritasium',
                description: 'Science videos',
                thumbnail: 'https://yt3.ggpht.com/avatar=s88-c-k-c0x00ffffff-no-rj',
                customUrl: '/@veritasium',
            },
        ]);
    });
});

describe('channel search cache', () => {
    it('searches generated query variants and ranks them against the original phrase', async () => {
        const requestedUrls = [];
        const fetchImpl = async (url) => {
            requestedUrls.push(String(url));
            if (String(url).includes('levelt')) {
                return {
                    ok: true,
                    json: async () => ({
                        items: [
                            {
                                url: '/channel/UC1234567890123456789012',
                                name: 'Level1Techs',
                                description: 'Computer hardware and Linux videos',
                                thumbnail: 'https://example.com/level.jpg',
                                subscribers: 1000000,
                            },
                        ],
                    }),
                    text: async () => '',
                };
            }

            return { ok: false, status: 500, json: async () => ([]), text: async () => '' };
        };

        const results = await searchChannels('Level One Techs', { fetchImpl, limit: 3 });

        expect(results[0]).toEqual(expect.objectContaining({
            id: 'UC1234567890123456789012',
            title: 'Level1Techs',
        }));
        expect(requestedUrls.some((url) => url.includes('levelt'))).toBe(true);
    });

    it('caps cached results at the configured LRU size', async () => {
        const emptyFetch = async () => ({ ok: false, status: 500, json: async () => ([]), text: async () => '' });
        const before = getSearchCacheStats().size;

        for (let i = 0; i < 150; i += 1) {
            await searchChannels(`query-${i}`, { fetchImpl: emptyFetch, limit: 1 });
        }

        const after = getSearchCacheStats();
        expect(after.size).toBeLessThanOrEqual(100);
        expect(after.maxEntries).toBe(100);
        expect(after.size).toBeGreaterThanOrEqual(before);
    });
});
