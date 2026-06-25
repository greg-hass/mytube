// LLM-based channel resolver with multi-provider support.
//
// Providers a function-calling loop that gives an LLM a web_search tool.
// The LLM searches the live web, we return results, and it produces a
// final answer (channel handle/ID). Results are ALWAYS verified by
// scraping the YouTube page before being trusted.
//
// Supported providers:
//   opencode  — https://opencode.ai/zen/v1/chat/completions  (free)
//   deepseek  — https://api.deepseek.com/v1/chat/completions (~$0.60/M tok)
//   custom    — user-provided endpoint, model, and auth header
//
// The custom provider accepts any OpenAI-compatible endpoint.

const LLM_TIMEOUT_MS = 12000;
const MAX_TOOL_ITERATIONS = 4; // single-channel resolution
const MAX_SUGGESTION_ITERATIONS = 8; // multi-channel discovery needs more

// ─── Provider configuration ──────────────────────────────────────────────

const PROVIDER_CONFIG = {
	opencode: {
		endpoint: "https://opencode.ai/zen/v1/chat/completions",
		defaultModel: "big-pickle",
		label: "opencode",
	},
	deepseek: {
		endpoint: "https://api.deepseek.com/v1/chat/completions",
		defaultModel: "deepseek-v4-flash",
		label: "deepseek",
	},
};

const SYSTEM_PROMPT = `You are a YouTube channel resolver. Given a user query, find the most likely YouTube channel.

You have one tool: web_search. Use it to search the live web for the channel.

If you find a confident match, return ONLY this JSON (no prose, no markdown fences):
{"handle":"MarioNawfal","title":"Mario Nawfal","url":"https://www.youtube.com/@MarioNawfal"}

If you cannot find a confident match after searching, return ONLY:
{"unknown":true}

Rules:
- handle is the @handle WITHOUT the @ symbol
- url is the full YouTube channel URL (https://www.youtube.com/@handle)
- title is the official channel display name
- Do not guess. Only return a channel you can verify exists via web search.
- If multiple channels could match, return the most prominent one (most subscribers, most well-known).
- You can call web_search up to 3 times if your first search didn't find a confident match.`;

const SUGGESTIONS_PROMPT = `You are a YouTube channel discovery assistant. Given a list of channels a user is subscribed to, suggest NEW YouTube channels they would likely enjoy.

Strategy:
1. Call web_search ONCE with a broad query like "channels similar to <subscription1> <subscription2>" to understand the user's interests.
2. Call web_search ONE more time for a different angle if needed.
3. After 1-2 searches, STOP searching and compile your final answer from what you found plus your knowledge of the YouTube ecosystem.

Return 5 suggestions as a JSON array (no prose, no markdown fences):
[
  {"handle":"channelhandle","title":"Channel Name","reason":"Why this channel matches the user's interests"},
  ...
]

Rules:
- handle is the @handle WITHOUT the @ symbol
- title is the official channel display name
- reason is a brief personalised reason (1 sentence)
- Only suggest channels the user is NOT already subscribed to
- Do NOT call web_search more than 3 times. Compile your answer after that.
- You may include channels from your training knowledge if they are well-known and match the user's interests — you do not need to web-search every single one.`;

const TOOLS = [
	{
		type: "function",
		function: {
			name: "web_search",
			description:
				"Search the web for YouTube channels matching a query. " +
				"Returns up to 5 results with title, URL, and a short snippet. " +
				"Use site:youtube.com in the query to bias results toward YouTube.",
			parameters: {
				type: "object",
				properties: {
					query: {
						type: "string",
						description:
							"The search query, e.g. 'mario nawfal youtube' or 'veritasium youtube channel'",
					},
					limit: {
						type: "integer",
						description:
							"Maximum number of results to return (1-10, default 5).",
					},
				},
				required: ["query"],
			},
		},
	},
];

// ─── Provider resolution ─────────────────────────────────────────────────

/**
 * Resolve provider config + options into { endpoint, model, apiKey, label }.
 * Priority: explicit option > provider config default > env var fallback.
 */
function resolveProvider(options = {}) {
	const providerName = options.provider || "opencode";
	const config = PROVIDER_CONFIG[providerName];

	// Custom provider — use explicit endpoint/model/key
	if (providerName === "custom" || !config) {
		return {
			endpoint: options.endpoint || "",
			model: options.model || "",
			apiKey: options.apiKey || "",
			label: "custom",
		};
	}

	const apiKey =
		options.apiKey !== undefined
			? options.apiKey
			: process.env[`${providerName.toUpperCase()}_API_KEY`] ||
				process.env.OPENCODE_API_KEY ||
				"";

	return {
		endpoint: options.endpoint || config.endpoint,
		model: options.model || config.defaultModel,
		apiKey,
		label: config.label,
	};
}

// ─── Main resolver ──────────────────────────────────────────────────────

/**
 * Resolve a free-text query to a YouTube channel handle or ID by
 * running an agent loop with an LLM + a web_search tool. Returns
 * the raw suggestion — callers MUST verify by scraping the YouTube
 * page before trusting the result.
 *
 * @param {string} query — the raw user input
 * @param {object} options
 * @param {string} [options.provider] — "opencode" (default), "deepseek", or "custom"
 * @param {string} [options.apiKey] — explicit API key (override env)
 * @param {string} [options.model] — override the provider's default model
 * @param {string} [options.endpoint] — custom endpoint (only used with provider="custom")
 * @param {string} [options.braveKey] — override process.env.BRAVE_API_KEY
 * @param {function} [options.fetchImpl] — override global fetch (for tests)
 * @param {AbortSignal} [options.signal] — external abort signal
 * @param {boolean} [options.useSuggestions] — use suggestions prompt instead of resolver prompt
 * @param {string} [options.subscriptionContext] — markdown list of subscribed channels (for suggestions)
 * @returns {Promise<{ type: "handle"|"channel_id", value: string, title?: string, provider: string }|Array|null>}
 *   - null if no API key, request failed, rate-limited, or model said "unknown"
 *   - Single result: { type, value, title, provider }
 *   - Suggestions mode: array of { type, value, title, reason, provider }
 */
async function resolveChannelViaLlm(query, options = {}) {
	const provider = resolveProvider(options);
	if (!provider.apiKey || !provider.endpoint) return null;

	const fetchImpl = options.fetchImpl || fetch;
	const externalSignal = options.signal;
	const braveKey =
		options.braveKey !== undefined
			? options.braveKey
			: process.env.BRAVE_API_KEY || "";

	const useSuggestions = options.useSuggestions === true;
	const maxIterations = useSuggestions
		? MAX_SUGGESTION_ITERATIONS
		: MAX_TOOL_ITERATIONS;
	const systemPrompt = useSuggestions ? SUGGESTIONS_PROMPT : SYSTEM_PROMPT;
	const messages = useSuggestions
		? [
				{ role: "system", content: systemPrompt },
				{
					role: "user",
					content: `Here are my subscriptions:\n\n${options.subscriptionContext || query}\n\n${query}`,
				},
			]
		: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: `Find the YouTube channel for: ${query}` },
			];

	for (let iteration = 0; iteration < maxIterations; iteration++) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
		if (externalSignal) {
			if (externalSignal.aborted) {
				controller.abort();
			} else {
				externalSignal.addEventListener("abort", () => controller.abort(), {
					once: true,
				});
			}
		}

		let response;
		try {
			response = await fetchImpl(provider.endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${provider.apiKey}`,
				},
				body: JSON.stringify({
					model: provider.model,
					messages,
					tools: TOOLS,
					tool_choice: "auto",
					temperature: useSuggestions ? 0.5 : 0,
				}),
				signal: controller.signal,
			});
		} catch (error) {
			if (error.name === "AbortError") {
				console.warn("LLM request timed out");
			} else {
				console.warn("LLM request failed:", error.message);
			}
			return null;
		} finally {
			clearTimeout(timeoutId);
		}

		if (!response.ok) {
			if (response.status === 429) {
				console.warn(
					`⚠️ LLM provider ${provider.label} rate-limited — skipping`,
				);
			} else if (response.status === 401) {
				console.warn(
					`⚠️ LLM provider ${provider.label} API key invalid — skipping`,
				);
			} else {
				console.warn(`LLM provider ${provider.label} error ${response.status}`);
			}
			return null;
		}

		let data;
		try {
			data = await response.json();
		} catch (error) {
			console.warn("LLM returned invalid JSON:", error.message);
			return null;
		}
		const message = data?.choices?.[0]?.message;
		if (!message) return null;

		messages.push(message);

		// No tool calls — this is the final answer. Parse it.
		if (!message.tool_calls || message.tool_calls.length === 0) {
			if (useSuggestions) {
				const parsed = parseSuggestionsResponse(message.content);
				if (!parsed || parsed.length === 0) return null;
				return parsed.map((item) => ({ ...item, provider: provider.label }));
			}
			const parsed = parseFinalResponse(message.content);
			if (!parsed) return null;
			return { ...parsed, provider: provider.label };
		}

		// Execute each tool call and append results.
		for (const toolCall of message.tool_calls) {
			const toolResult = await executeToolCall(toolCall, {
				fetchImpl,
				braveKey,
				signal: externalSignal,
			});
			messages.push({
				role: "tool",
				tool_call_id: toolCall.id,
				content: toolResult,
			});
		}

		// Convergence nudge: on the last 2 iterations, instruct the
		// model to stop searching and produce its final answer.
		if (iteration >= maxIterations - 2) {
			messages.push({
				role: "system",
				content: useSuggestions
					? "You have done enough research. STOP calling web_search and return your JSON array of 5 channel suggestions now."
					: "You have done enough research. STOP calling web_search and return your final JSON answer now.",
			});
		}
	}

	console.warn(
		`[llm-tier] Tool loop hit max iterations (${maxIterations}) — aborting`,
	);
	return null;
}

/**
 * Backward-compatible alias for code that still references the old name.
 * @deprecated Use resolveChannelViaLlm instead.
 */
async function resolveChannelViaOpencode(query, options = {}) {
	// Map the old options shape to the new one:
	//   old: options.apiKey → opencode-specific API key
	//   new: options.apiKey → provider API key (same)
	return resolveChannelViaLlm(query, {
		...options,
		provider: options.provider || "opencode",
	});
}

// ─── Tool execution ──────────────────────────────────────────────────────

/**
 * Dispatch a single tool call. Currently only `web_search` is defined;
 * unknown tools get a JSON error result so the model can self-correct.
 */
async function executeToolCall(toolCall, options) {
	const name = toolCall?.function?.name;
	let args = {};
	try {
		args = JSON.parse(toolCall?.function?.arguments || "{}");
	} catch {
		// Malformed args — fall through to empty object.
	}

	if (name === "web_search") {
		return executeWebSearch(args, options);
	}

	return JSON.stringify({ error: `Unknown function: ${name}` });
}

/**
 * Run a web search and return a JSON-serialized result the LLM can
 * consume. Backend: Brave if a key is set, otherwise DuckDuckGo HTML
 * (no API key, no rate limits we know of, slightly lower quality).
 */
async function executeWebSearch(args, options) {
	const query = String(args.query || "").trim();
	const limit = Math.min(Math.max(parseInt(args.limit, 10) || 5, 1), 10);

	if (!query) {
		return JSON.stringify({ error: "Missing query parameter" });
	}

	const backend = options.braveKey ? "brave" : "duckduckgo";
	let results;
	try {
		results = options.braveKey
			? await searchBrave(query, limit, options)
			: await searchDuckDuckGo(query, limit, options);
	} catch (error) {
		return JSON.stringify({ backend, error: error.message, results: [] });
	}

	return JSON.stringify({ backend, query, count: results.length, results });
}

/**
 * DuckDuckGo HTML search. Free, no API key required. The endpoint
 * returns a server-rendered HTML page with results in `.result`
 * blocks; we extract title, URL (from the redirect), and snippet.
 */
async function searchDuckDuckGo(query, limit, options) {
	const fetchImpl = options.fetchImpl || fetch;
	const signal = options.signal;

	try {
		const response = await fetchImpl(
			`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
			{
				headers: { "User-Agent": "Mozilla/5.0 (compatible; mytube/1.0)" },
				signal,
			},
		);

		if (!response.ok) return [];
		const html = await response.text();
		return parseDuckDuckGoResults(html, limit);
	} catch (error) {
		console.warn("DuckDuckGo search failed:", error.message);
		return [];
	}
}

/**
 * Parse DDG's HTML result page. Returns an array of {title,url,snippet}.
 * Tolerant to whitespace and minor markup variations.
 */
function parseDuckDuckGoResults(html, limit) {
	const results = [];
	if (typeof html !== "string" || !html) return results;

	const blockRegex =
		/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<\/div>)/g;

	let match;
	while ((match = blockRegex.exec(html)) !== null && results.length < limit) {
		const [, rawUrl, titleHtml, snippetHtml] = match;

		// DDG wraps real URLs in a redirect: //duckduckgo.com/l/?uddg=<encoded>&...
		let url = rawUrl;
		const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
		if (uddgMatch) {
			try {
				url = decodeURIComponent(uddgMatch[1]);
			} catch {
				// Keep original if decoding fails.
			}
		}

		results.push({
			title: stripHtml(titleHtml).trim(),
			url,
			snippet: stripHtml(snippetHtml || "").trim(),
		});
	}

	return results;
}

/**
 * Brave Web Search API. Higher quality than DDG but requires an API key.
 * Used automatically when BRAVE_API_KEY is set.
 */
async function searchBrave(query, limit, options) {
	const fetchImpl = options.fetchImpl || fetch;
	const signal = options.signal;

	try {
		const response = await fetchImpl(
			`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`,
			{
				headers: {
					"X-Subscription-Token": options.braveKey,
					Accept: "application/json",
				},
				signal,
			},
		);

		if (!response.ok) return [];
		const data = await response.json();
		const items = Array.isArray(data?.web?.results) ? data.web.results : [];

		return items.map((item) => ({
			title: item.title || "",
			url: item.url || "",
			snippet: item.description || "",
		}));
	} catch (error) {
		console.warn("Brave search failed:", error.message);
		return [];
	}
}

/**
 * Strip HTML tags and decode common entities.
 */
function stripHtml(html) {
	return String(html || "")
		.replace(/<[^>]+>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ")
		.trim();
}

// ─── Response parsing ─────────────────────────────────────────────────────

/**
 * Parse big-pickle's final answer. Accepts:
 *   - Plain JSON
 *   - JSON wrapped in markdown code fences
 *   - JSON embedded in prose (regex fallback)
 *
 * Returns null on any parse failure, "unknown" response, or empty input.
 */
function parseFinalResponse(content) {
	let text = String(content || "").trim();
	if (!text) return null;

	const codeBlockMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
	if (codeBlockMatch) text = codeBlockMatch[1].trim();

	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		const objectMatch = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
		if (!objectMatch) return null;
		try {
			parsed = JSON.parse(objectMatch[0]);
		} catch {
			return null;
		}
	}

	if (!parsed || typeof parsed !== "object") return null;
	if (parsed.unknown === true) return null;

	const handle = String(parsed.handle || "")
		.replace(/^@/, "")
		.trim();
	const url = String(parsed.url || "").trim();
	const title = String(parsed.title || "").trim() || undefined;

	if (handle) {
		return { type: "handle", value: handle, title };
	}

	if (url) {
		const handleMatch = url.match(/youtube\.com\/@([\w.-]+)/i);
		if (handleMatch) {
			return { type: "handle", value: handleMatch[1], title };
		}
		const channelIdMatch = url.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
		if (channelIdMatch) {
			return { type: "channel_id", value: channelIdMatch[1], title };
		}
	}

	return null;
}

/**
 * Parse the suggestions response — expects a JSON array of
 * { handle, title, reason } objects. Returns null on failure.
 */
function parseSuggestionsResponse(content) {
	let text = String(content || "").trim();
	if (!text) return null;

	const codeBlockMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
	if (codeBlockMatch) text = codeBlockMatch[1].trim();

	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		const arrayMatch = text.match(/\[[\s\S]*\]/);
		if (!arrayMatch) return null;
		try {
			parsed = JSON.parse(arrayMatch[0]);
		} catch {
			return null;
		}
	}

	if (!Array.isArray(parsed) || parsed.length === 0) return null;

	return parsed
		.map((item) => {
			const handle = String(item.handle || "")
				.replace(/^@/, "")
				.trim();
			const title = String(item.title || "").trim();
			const reason = String(item.reason || "").trim();
			if (!handle || !title) return null;
			return { type: "handle", value: handle, title, reason };
		})
		.filter(Boolean);
}

// ─── Backend status ──────────────────────────────────────────────────────

/**
 * Which LLM backends are available given the current environment.
 */
function getLlmBackendStatus() {
	const opencodeKey = process.env.OPENCODE_API_KEY;
	const deepseekKey = process.env.DEEPSEEK_API_KEY;

	return {
		opencode: {
			available: Boolean(opencodeKey),
			model: PROVIDER_CONFIG.opencode.defaultModel,
			endpoint: PROVIDER_CONFIG.opencode.endpoint,
		},
		deepseek: {
			available: Boolean(deepseekKey),
			model: PROVIDER_CONFIG.deepseek.defaultModel,
			endpoint: PROVIDER_CONFIG.deepseek.endpoint,
		},
		searchBackend: process.env.BRAVE_API_KEY ? "brave" : "duckduckgo",
	};
}

/**
 * Backward-compatible alias.
 * @deprecated Use getLlmBackendStatus instead.
 */
function getOpencodeBackendStatus() {
	const status = getLlmBackendStatus();
	return {
		available: status.opencode.available,
		model: status.opencode.model,
		endpoint: status.opencode.endpoint,
		searchBackend: status.searchBackend,
	};
}

// Backward-compat constant aliases
const OPENCODE_MODEL = PROVIDER_CONFIG.opencode.defaultModel;
const OPENCODE_ENDPOINT = PROVIDER_CONFIG.opencode.endpoint;

module.exports = {
	MAX_TOOL_ITERATIONS,
	MAX_SUGGESTION_ITERATIONS,
	OPENCODE_MODEL,
	OPENCODE_ENDPOINT,
	PROVIDER_CONFIG,
	SYSTEM_PROMPT,
	SUGGESTIONS_PROMPT,
	TOOLS,
	executeToolCall,
	executeWebSearch,
	getLlmBackendStatus,
	getOpencodeBackendStatus,
	parseDuckDuckGoResults,
	parseFinalResponse,
	parseSuggestionsResponse,
	resolveChannelViaLlm,
	resolveChannelViaOpencode,
	searchBrave,
	searchDuckDuckGo,
	stripHtml,
	resolveProvider,
};
