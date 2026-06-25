// OpenCode big-pickle as a tier-6a channel resolver in the search funnel.
//
// big-pickle is OpenCode's free fine-tuned model served through an
// OpenAI-compatible chat completions API. The model itself does NOT have
// web access — the OpenCode agent CLI has a webfetch/websearch tool
// wired into its runtime, but those tools are not exposed through the
// HTTP API.
//
// We give the model web access ourselves by passing a `web_search` tool
// definition. The model emits tool calls, our server runs the search
// (DuckDuckGo HTML by default, or Brave if BRAVE_API_KEY is set), feeds
// the results back, and the model produces its final answer.
//
// Endpoint: https://opencode.ai/zen/v1/chat/completions
// Model:    big-pickle
// Auth:     OPENCODE_API_KEY (free; user already has it configured)
//
// We always verify the LLM's final suggestion by scraping the YouTube
// page (resolveDirectChannelByScrape in channel-search.js). LLMs
// hallucinate handles, so the verification step is what makes this safe.

const OPENCODE_TIMEOUT_MS = 12000;
const OPENCODE_MODEL = "big-pickle";
const OPENCODE_ENDPOINT = "https://opencode.ai/zen/v1/chat/completions";
const MAX_TOOL_ITERATIONS = 4;

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

/**
 * Resolve a free-text query to a YouTube channel handle or ID by
 * running an agent loop with big-pickle + a web_search tool. Returns
 * the raw suggestion — callers MUST verify by scraping the YouTube
 * page before trusting the result.
 *
 * @param {string} query — the raw user input
 * @param {object} options
 * @param {string} [options.apiKey] — override process.env.OPENCODE_API_KEY
 * @param {string} [options.braveKey] — override process.env.BRAVE_API_KEY
 * @param {function} [options.fetchImpl] — override global fetch (for tests)
 * @param {AbortSignal} [options.signal] — external abort signal
 * @param {string} [options.model] — override the model
 * @returns {Promise<{ type: "handle"|"channel_id", value: string, title?: string, provider: string }|null>}
 *   - null if no API key, request failed, rate-limited, or model said "unknown"
 *   - `provider` is "opencode" so callers can attribute the result
 */
async function resolveChannelViaOpencode(query, options = {}) {
	const apiKey =
		options.apiKey !== undefined
			? options.apiKey
			: process.env.OPENCODE_API_KEY;
	if (!apiKey) return null;

	const fetchImpl = options.fetchImpl || fetch;
	const externalSignal = options.signal;
	const model = options.model || OPENCODE_MODEL;
	const braveKey =
		options.braveKey !== undefined
			? options.braveKey
			: process.env.BRAVE_API_KEY || "";

	const messages = [
		{ role: "system", content: SYSTEM_PROMPT },
		{ role: "user", content: `Find the YouTube channel for: ${query}` },
	];

	for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), OPENCODE_TIMEOUT_MS);
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
			response = await fetchImpl(OPENCODE_ENDPOINT, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model,
					messages,
					tools: TOOLS,
					tool_choice: "auto",
					temperature: 0,
				}),
				signal: controller.signal,
			});
		} catch (error) {
			if (error.name === "AbortError") {
				console.warn("OpenCode request timed out");
			} else {
				console.warn("OpenCode request failed:", error.message);
			}
			return null;
		} finally {
			clearTimeout(timeoutId);
		}

		if (!response.ok) {
			if (response.status === 429) {
				console.warn(
					"⚠️ OpenCode rate-limited — channel search will skip tier 6a",
				);
			} else if (response.status === 401) {
				console.warn(
					"⚠️ OpenCode API key invalid — channel search will skip tier 6a",
				);
			} else {
				console.warn(`OpenCode error ${response.status}`);
			}
			return null;
		}

		let data;
		try {
			data = await response.json();
		} catch (error) {
			console.warn("OpenCode returned invalid JSON:", error.message);
			return null;
		}
		const message = data?.choices?.[0]?.message;
		if (!message) return null;

		// Add the assistant's reply to the conversation history. The
		// OpenAI API requires this before we send the tool results back.
		messages.push(message);

		// No tool calls — this is the final answer. Parse it.
		if (!message.tool_calls || message.tool_calls.length === 0) {
			const parsed = parseFinalResponse(message.content);
			if (!parsed) return null;
			return { ...parsed, provider: "opencode" };
		}

		// Execute each tool call and append the results to the conversation.
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
	}

	// Hit max iterations without a final answer. Don't loop forever —
	// the LLM should converge on an answer in 1-3 iterations.
	console.warn(
		`[opencode-tier] Tool loop hit max iterations (${MAX_TOOL_ITERATIONS}) — aborting`,
	);
	return null;
}

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

	// Match each <a class="result__a" href="...">TITLE</a> along with the
	// snippet that follows. DDG uses redirect URLs that contain uddg=...
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
 * Strip HTML tags and decode common entities. Used for parsing DDG's
 * server-rendered HTML, which is small enough that we can do it inline.
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
 * Which OpenCode backends are available given the current environment.
 * Shape consumed by the channel-search.js status aggregator.
 */
function getOpencodeBackendStatus() {
	return {
		available: Boolean(process.env.OPENCODE_API_KEY),
		model: OPENCODE_MODEL,
		endpoint: OPENCODE_ENDPOINT,
		searchBackend: process.env.BRAVE_API_KEY ? "brave" : "duckduckgo",
	};
}

module.exports = {
	MAX_TOOL_ITERATIONS,
	OPENCODE_ENDPOINT,
	OPENCODE_MODEL,
	SYSTEM_PROMPT,
	TOOLS,
	executeToolCall,
	executeWebSearch,
	getOpencodeBackendStatus,
	parseDuckDuckGoResults,
	parseFinalResponse,
	resolveChannelViaOpencode,
	searchBrave,
	searchDuckDuckGo,
	stripHtml,
};
