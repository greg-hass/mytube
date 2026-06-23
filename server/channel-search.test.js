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
  	it('builds query variants prioritizing the meaningful phrase', () => {
        // No stopwords in "Level One Techs" → all tokens are meaningful.
        // The meaningful phrase and its variants come first; abbreviations
        // are kept as lower-priority fallbacks.
        expect(buildChannelSearchQueries('Level One Techs')).toEqual([
            'level one techs',
            'level one techs channel',
            'levelonetechs',
            'levelt',
            '@levelt',
        ]);
    });

  	it('prioritizes the meaningful token for natural language queries', () => {
        // "the best woodworking channels" → meaningful token "woodworking".
        // The meaningful token and its "channel" variant come first; the
        // original phrase is kept as a full-text fallback.
        const queries = buildChannelSearchQueries('the best woodworking channels');

        expect(queries[0]).toBe('woodworking');
        expect(queries).toContain('woodworking channel');
        // No stopword-based abbreviations.
        expect(queries).not.toContain('thec');
        expect(queries).not.toContain('@thec');
        expect(queries).not.toContain('tbtwc');
        // Original phrase kept for full-text matching.
        expect(queries).toContain('the best woodworking channels');
    });

    it('returns an empty query list when the input is only stopwords', () => {
        // "the best" carries no meaningful terms — returning queries built from
        // stopwords would just spam the backends with junk. Empty list lets the
        // frontend surface "no channels found" instead of misleading results.
        expect(buildChannelSearchQueries('the best')).toEqual([]);
        expect(buildChannelSearchQueries('channels')).toEqual([]);
    });

  	it('prioritizes meaningful multi-token phrases over abbreviations', () => {
        // "best tech review channels" → meaningful tokens ["tech", "review"]
        // → meaningful phrase "tech review" first, abbreviation "techr" later.
        const queries = buildChannelSearchQueries('best tech review channels');

        expect(queries).not.toContain('btrc');
        expect(queries[0]).toBe('tech review');
        expect(queries).toContain('tech review channel');
        expect(queries).toContain('techr');
        expect(queries).toContain('best tech review channels');
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

    it('scores meaningful-token matches above stopword noise', () => {
        // "the best woodworking channels" → meaningful "woodworking"
        expect(scoreChannelResult('the best woodworking channels', {
            id: 'UC1234567890123456789012',
            title: 'Woodworking Art',
        })).toBeGreaterThan(50);

        // A channel with no woodworking connection scores 0.
        expect(scoreChannelResult('the best woodworking channels', {
            id: 'UC2222222222222222222222',
            title: 'The Big Bang Theory',
        })).toBe(0);
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

    it('finds channels via the meaningful query when the original phrase fails', async () => {
        const getUrlQuery = (url) => {
            const u = new URL(String(url), 'http://dummy');
            return u.searchParams.get('q') || u.searchParams.get('search_query') || '';
        };

        const fetchImpl = async (url) => {
            // Only the bare meaningful query "woodworking" returns results.
            // The original phrase "the best woodworking channels" returns 500,
            // proving that the meaningful query is what finds the channel.
            if (getUrlQuery(url) === 'woodworking') {
                return {
                    ok: true,
                    json: async () => ({
                        items: [
                            {
                                url: '/channel/UC3333333333333333333333',
                                name: 'Woodworking Art',
                                description: 'Fine woodworking tutorials',
                                thumbnail: 'https://example.com/ww.jpg',
                                subscribers: 500000,
                            },
                        ],
                    }),
                    text: async () => '',
                };
            }

            return { ok: false, status: 500, json: async () => ([]), text: async () => '' };
        };

        const results = await searchChannels('the best woodworking channels', { fetchImpl, limit: 3 });

        expect(results[0]).toEqual(expect.objectContaining({
            id: 'UC3333333333333333333333',
            title: 'Woodworking Art',
        }));
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
