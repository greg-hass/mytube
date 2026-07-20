// Personalised channel suggestions for "Discover Channels".
//
// When DEEPSEEK_API_KEY is configured, an LLM (deepseek-v4-flash) suggests
// new channels based on the user's subscription list. Every suggested handle
// is verified by scraping the YouTube channel page before it is returned —
// unverifiable (hallucinated) handles are dropped. When no key is configured
// or the LLM path fails, falls back to title-based YouTube search.

const { resolveChannelViaLlm } = require("./llm-channel-resolver");
const {
	searchChannels,
	resolveDirectChannelByScrape,
} = require("./channel-search");

const MAX_CONTEXT_SUBSCRIPTIONS = 30;
const MAX_SUGGESTIONS = 5;

function buildSubscriptionContext(subscriptions) {
	return subscriptions
		.slice(0, MAX_CONTEXT_SUBSCRIPTIONS)
		.map((subscription) => {
			const handle = String(subscription.handle || "").replace(/^@/, "");
			return `- ${subscription.title}${handle ? ` (@${handle})` : ""}`;
		})
		.join("\n");
}

/**
 * Verify one LLM suggestion by scraping the channel page. Returns a channel
 * object in the shape the frontend expects, or null when the handle does not
 * resolve to a real channel.
 */
async function verifySuggestion(suggestion, options = {}) {
	if (suggestion?.type !== "handle" || !suggestion.value) return null;
	const results = await resolveDirectChannelByScrape(
		{ type: "handle", value: suggestion.value },
		{ fetchImpl: options.fetchImpl },
	);
	const channel = results[0];
	if (!channel?.id) return null;
	return {
		id: channel.id,
		title: channel.title || suggestion.title || suggestion.value,
		description: channel.description || "",
		thumbnail: channel.thumbnail || "",
		customUrl: channel.customUrl || `/@${suggestion.value}`,
		reason: suggestion.reason || undefined,
	};
}

async function getLlmSuggestions(subscriptions, options = {}) {
	const context = buildSubscriptionContext(subscriptions);
	const suggestions = await resolveChannelViaLlm("", {
		provider: "deepseek",
		useSuggestions: true,
		subscriptionContext: context,
		fetchImpl: options.fetchImpl,
	});
	if (!Array.isArray(suggestions) || suggestions.length === 0) return null;

	const existingIds = new Set(subscriptions.map((s) => s.id));
	const verified = await Promise.all(
		suggestions
			.slice(0, MAX_SUGGESTIONS)
			.map((suggestion) => verifySuggestion(suggestion, options)),
	);

	const byId = new Map();
	for (const channel of verified) {
		if (channel && !existingIds.has(channel.id)) byId.set(channel.id, channel);
	}
	return byId.size > 0 ? Array.from(byId.values()) : null;
}

async function getFallbackSuggestions(subscriptions, options = {}) {
	const existingIds = new Set(subscriptions.map((s) => s.id));
	const searches = await Promise.all(
		subscriptions.slice(0, 3).map((subscription) =>
			searchChannels(String(subscription.title || ""), {
				limit: 4,
				youtubeApiKey: options.youtubeApiKey,
				fetchImpl: options.fetchImpl,
			}),
		),
	);
	const suggestions = new Map();
	for (const channel of searches.flat()) {
		if (!channel?.id || existingIds.has(channel.id)) continue;
		suggestions.set(channel.id, channel);
	}
	return Array.from(suggestions.values()).slice(0, 8);
}

/**
 * Suggest new channels for a subscription list. Returns an array of channel
 * objects; LLM-sourced entries include a `reason` string.
 */
async function getChannelSuggestions(subscriptions, options = {}) {
	const list = Array.isArray(subscriptions) ? subscriptions : [];

	if (process.env.DEEPSEEK_API_KEY) {
		try {
			const llmResults = await getLlmSuggestions(list, options);
			if (llmResults) return llmResults;
		} catch (error) {
			console.warn(
				"LLM channel suggestions failed, using fallback:",
				error.message,
			);
		}
	}

	return getFallbackSuggestions(list, options);
}

module.exports = {
	buildSubscriptionContext,
	getChannelSuggestions,
	getFallbackSuggestions,
	getLlmSuggestions,
	verifySuggestion,
};
