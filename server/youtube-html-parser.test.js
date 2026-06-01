import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { extractYouTubeChannelMetadata, isYouTubeHtmlParsingEnabled } = require('./youtube-html-parser');

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
});

describe('extractYouTubeChannelMetadata', () => {
    it('returns nulls for empty input', () => {
        expect(extractYouTubeChannelMetadata('')).toEqual({ channelId: null, title: null });
        expect(extractYouTubeChannelMetadata(null)).toEqual({ channelId: null, title: null });
    });

    it('extracts channelId from the canonical channel/UC... path', () => {
        const html = '<html><body><link rel="canonical" href="https://www.youtube.com/channel/UChnyfMqiRRG1u-2MsSQLbXA"></body></html>';
        expect(extractYouTubeChannelMetadata(html)).toEqual({
            channelId: 'UChnyfMqiRRG1u-2MsSQLbXA',
            title: null,
        });
    });

    it('falls back to the JSON channelId field when the canonical link is missing', () => {
        const html = '<html><head><meta property="og:title" content="Veritasium"></head><body><script>{"channelId":"UChnyfMqiRRG1u-2MsSQLbXA"}</script></body></html>';
        expect(extractYouTubeChannelMetadata(html)).toEqual({
            channelId: 'UChnyfMqiRRG1u-2MsSQLbXA',
            title: 'Veritasium',
        });
    });

    it('returns title from og:title meta even when no channelId is present', () => {
        const html = '<html><head><meta property="og:title" content="Linux Channel"></head><body></body></html>';
        expect(extractYouTubeChannelMetadata(html)).toEqual({
            channelId: null,
            title: 'Linux Channel',
        });
    });

    it('rejects malformed channel ids that do not match the UC pattern', () => {
        const html = '<html><body><a href="/channel/handle_evil">link</a></body></html>';
        expect(extractYouTubeChannelMetadata(html)).toEqual({ channelId: null, title: null });
    });

    it('respects the YOUTUBE_HTML_PARSING_ENABLED kill switch', () => {
        process.env.YOUTUBE_HTML_PARSING_ENABLED = 'false';
        expect(isYouTubeHtmlParsingEnabled()).toBe(false);
        const html = '<html><body><link rel="canonical" href="https://www.youtube.com/channel/UChnyfMqiRRG1u-2MsSQLbXA"></body></html>';
        expect(extractYouTubeChannelMetadata(html)).toEqual({ channelId: null, title: null, disabled: true });
    });

    it('treats YOUTUBE_HTML_PARSING_ENABLED=true as enabled', () => {
        process.env.YOUTUBE_HTML_PARSING_ENABLED = 'true';
        expect(isYouTubeHtmlParsingEnabled()).toBe(true);
    });
});
