/**
 * channelSearch — pure helpers used by the AddChannelModal and its
 * search hook. Kept in their own module so they're easy to unit-test
 * without dragging in React state.
 */
import type { YouTubeChannel } from "../types/youtube";

/**
 * Normalize a free-form text value into a comparable form: lowercased,
 * no leading "@", only alphanumerics, single-spaced. Used for both
 * queries and channel text fields (title, description, customUrl) so
 * comparisons work despite casing, punctuation, and whitespace.
 */
export function normalizeSearchText(value: string) {
	return String(value || "")
		.toLowerCase()
		.replace(/^@/, "")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function compactSearchText(value: string) {
	return normalizeSearchText(value).replace(/\s+/g, "");
}

// Must match the server-side STOPWORDS in server/channel-search.js.
const STOPWORDS = new Set([
	"a",
	"an",
	"the",
	"and",
	"or",
	"of",
	"for",
	"with",
	"to",
	"best",
	"top",
	"good",
	"great",
	"channels",
	"channel",
	"youtube",
	"videos",
]);

/**
 * Strip stopwords so "the best woodworking channels" ranks against
 * "woodworking", not the full natural-language phrase. Returns an
 * empty string when only stopwords remain (in which case the caller
 * should fall back to the full normalized query).
 */
export function getMeaningfulSearchText(query: string): string {
	const tokens = normalizeSearchText(query)
		.split(" ")
		.filter((token) => token && !STOPWORDS.has(token));
	return tokens.length > 0 ? tokens.join(" ") : "";
}

interface ScoreInputs {
	queryText: string;
	compactQuery: string;
	queryTokens: string[];
	firstToken: string;
	title: string;
	compactTitle: string;
	description: string;
	customUrl: string;
	haystack: string;
	compactHaystack: string;
}

function prepareScoreInputs(
	query: string,
	channel: YouTubeChannel,
): ScoreInputs | null {
	const queryText =
		getMeaningfulSearchText(query) || normalizeSearchText(query);
	if (!queryText) return null;

	const queryTokens = queryText.split(" ").filter(Boolean);
	if (queryTokens.length === 0) return null;

	const title = normalizeSearchText(channel.title);
	const description = normalizeSearchText(channel.description || "");
	const customUrl = normalizeSearchText(channel.customUrl || "");
	const haystack = `${title} ${description} ${customUrl}`.trim();
	if (!haystack) return null;

	return {
		queryText,
		compactQuery: compactSearchText(queryText),
		queryTokens,
		firstToken: queryTokens[0],
		title,
		compactTitle: compactSearchText(channel.title),
		description,
		customUrl,
		haystack,
		compactHaystack: compactSearchText(haystack),
	};
}

function scoreExactMatch(input: ScoreInputs) {
	if (input.title === input.queryText || input.customUrl === input.queryText)
		return 120;
	if (
		input.compactTitle === input.compactQuery ||
		input.customUrl === input.compactQuery
	)
		return 100;
	return 0;
}

function scorePrefixMatch(input: ScoreInputs) {
	if (input.title.startsWith(input.queryText)) return 60;
	if (input.customUrl.startsWith(input.queryText)) return 60;
	if (input.title.startsWith(input.firstToken)) return 8;
	return 0;
}

function scoreSubstringMatch(input: ScoreInputs) {
	let score = 0;
	if (input.title.includes(input.queryText)) score += 30;
	if (input.compactQuery && input.compactHaystack.includes(input.compactQuery))
		score += 28;
	if (
		input.description.includes(input.queryText) ||
		input.customUrl.includes(input.queryText)
	)
		score += 18;
	if (input.description.includes(input.firstToken)) score += 4;
	return score;
}

function scoreTokenCoverage(input: ScoreInputs) {
	if (input.queryTokens.length === 0) return 0;
	const matched = input.queryTokens.filter((token) =>
		input.haystack.includes(token),
	).length;
	return Math.round((matched / input.queryTokens.length) * 50);
}

export function scoreSearchResult(query: string, channel: YouTubeChannel) {
	const inputs = prepareScoreInputs(query, channel);
	if (!inputs) return 0;

	return (
		scoreExactMatch(inputs) +
		scorePrefixMatch(inputs) +
		scoreSubstringMatch(inputs) +
		scoreTokenCoverage(inputs)
	);
}

export function dedupeChannels(channels: YouTubeChannel[]) {
	const byId = new Map<string, YouTubeChannel>();

	for (const channel of channels) {
		if (!channel?.id) continue;
		const existing = byId.get(channel.id);
		if (!existing) {
			byId.set(channel.id, channel);
			continue;
		}

		byId.set(channel.id, {
			...existing,
			...channel,
			description: channel.description || existing.description,
			thumbnail: channel.thumbnail || existing.thumbnail,
			subscriberCount: channel.subscriberCount || existing.subscriberCount,
			customUrl: channel.customUrl || existing.customUrl,
		});
	}

	return Array.from(byId.values());
}

export function formatSubscriberCount(value?: string) {
	if (!value) return null;

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) return value;

	return `${parsed.toLocaleString()} subscribers`;
}

export function formatVideoCount(value?: string) {
	if (!value) return null;

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) return value;

	return `${parsed.toLocaleString()} videos`;
}

export function subscriberCountForSort(channel: YouTubeChannel): number {
	const parsed = Number.parseInt(channel.subscriberCount || "", 10);
	return Number.isFinite(parsed) ? parsed : 0;
}
