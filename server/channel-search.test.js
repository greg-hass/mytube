import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    dedupeAndRankChannels,
    getSearchCacheStats,
    parseYouTubeChannelSearchResults,
    scoreChannelResult,
    searchChannels,
} = require('./channel-search');

describe('channel search ranking', () => {
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
