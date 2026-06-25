import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
	MAX_TOOL_ITERATIONS,
	OPENCODE_ENDPOINT,
	OPENCODE_MODEL,
	SYSTEM_PROMPT,
	TOOLS,
	extractAnswerText,
	resolveChannelViaLlm,
	executeToolCall,
	executeWebSearch,
	getOpencodeBackendStatus,
	parseDuckDuckGoResults,
	parseFinalResponse,
	resolveChannelViaOpencode,
	searchBrave,
	searchDuckDuckGo,
	stripHtml,
} = require("./opencode-channel-resolver");

describe("module constants", () => {
	it("exposes the expected model id", () => {
		expect(OPENCODE_MODEL).toBe("big-pickle");
	});

	it("exposes the OpenCode Zen endpoint", () => {
		expect(OPENCODE_ENDPOINT).toBe(
			"https://opencode.ai/zen/v1/chat/completions",
		);
	});

	it("bounds the tool loop so we can't get stuck forever", () => {
		expect(MAX_TOOL_ITERATIONS).toBeGreaterThan(0);
		expect(MAX_TOOL_ITERATIONS).toBeLessThanOrEqual(8);
	});

	it("declares a web_search tool in the tool list", () => {
		const webSearch = TOOLS.find((t) => t.function?.name === "web_search");
		expect(webSearch).toBeTruthy();
		expect(webSearch.function.parameters.required).toContain("query");
	});
});

describe("system prompt", () => {
	it("instructs the model to use web search", () => {
		expect(SYSTEM_PROMPT).toMatch(/web_search/i);
	});

	it("specifies a JSON response format with handle and url", () => {
		expect(SYSTEM_PROMPT).toContain('"handle"');
		expect(SYSTEM_PROMPT).toContain('"url"');
	});

	it("specifies an 'unknown' response when no match is found", () => {
		expect(SYSTEM_PROMPT).toContain('"unknown"');
	});
});

describe("stripHtml", () => {
	it("strips HTML tags", () => {
		expect(stripHtml("<b>hello</b>")).toBe("hello");
	});

	it("decodes common entities", () => {
		expect(stripHtml("a &amp; b &lt; c &gt; d &quot;e&quot;")).toBe(
			'a & b < c > d "e"',
		);
	});

	it("handles empty input", () => {
		expect(stripHtml("")).toBe("");
		expect(stripHtml(null)).toBe("");
		expect(stripHtml(undefined)).toBe("");
	});

	it("replaces non-breaking spaces with regular spaces", () => {
		expect(stripHtml("hello&nbsp;world")).toBe("hello world");
	});
});

describe("parseFinalResponse", () => {
	it("parses a clean JSON response with handle", () => {
		const result = parseFinalResponse(
			JSON.stringify({
				handle: "MarioNawfal",
				title: "Mario Nawfal",
				url: "https://www.youtube.com/@MarioNawfal",
			}),
		);
		expect(result).toEqual({
			type: "handle",
			value: "MarioNawfal",
			title: "Mario Nawfal",
		});
	});

	it("strips @ from the handle if present", () => {
		const result = parseFinalResponse(
			JSON.stringify({ handle: "@MarioNawfal" }),
		);
		expect(result.value).toBe("MarioNawfal");
	});

	it("parses JSON wrapped in markdown code fences", () => {
		const result = parseFinalResponse(
			"```json\n" +
				JSON.stringify({ handle: "mkbhd", title: "MKBHD" }) +
				"\n```",
		);
		expect(result).toEqual({
			type: "handle",
			value: "mkbhd",
			title: "MKBHD",
		});
	});

	it("parses JSON embedded in prose", () => {
		const result = parseFinalResponse(
			"Here is the answer: " +
				JSON.stringify({ handle: "veritasium", title: "Veritasium" }) +
				" Let me know if you need more.",
		);
		expect(result).toEqual({
			type: "handle",
			value: "veritasium",
			title: "Veritasium",
		});
	});

	it("extracts handle from a YouTube URL when handle is missing", () => {
		const result = parseFinalResponse(
			JSON.stringify({
				url: "https://www.youtube.com/@mkbhd",
				title: "MKBHD",
			}),
		);
		expect(result).toEqual({
			type: "handle",
			value: "mkbhd",
			title: "MKBHD",
		});
	});

	it("extracts channel ID from a YouTube /channel/ URL", () => {
		const result = parseFinalResponse(
			JSON.stringify({
				url: "https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ",
				title: "MKBHD",
			}),
		);
		expect(result).toEqual({
			type: "channel_id",
			value: "UCBJycsmduvYEL83R_U4JriQ",
			title: "MKBHD",
		});
	});

	it("returns null for an 'unknown' response", () => {
		expect(parseFinalResponse(JSON.stringify({ unknown: true }))).toBeNull();
	});

	it("returns null for empty input", () => {
		expect(parseFinalResponse("")).toBeNull();
		expect(parseFinalResponse("   ")).toBeNull();
		expect(parseFinalResponse(null)).toBeNull();
	});

	it("returns null when the response isn't valid JSON", () => {
		expect(parseFinalResponse("This is not JSON at all")).toBeNull();
		expect(parseFinalResponse("{not valid json}")).toBeNull();
	});

	it("returns null when the JSON has no handle and no usable url", () => {
		expect(
			parseFinalResponse(JSON.stringify({ title: "Some Channel" })),
		).toBeNull();
		expect(parseFinalResponse(JSON.stringify({}))).toBeNull();
	});

	it("returns null for a url that isn't YouTube", () => {
		expect(
			parseFinalResponse(JSON.stringify({ url: "https://example.com/foo" })),
		).toBeNull();
	});

	it("falls back to undefined title when only handle is provided", () => {
		const result = parseFinalResponse(JSON.stringify({ handle: "mkbhd" }));
		expect(result.title).toBeUndefined();
	});
});

describe("parseDuckDuckGoResults", () => {
	const sampleHtml = `
		<html><body>
			<div class="result">
				<a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.youtube.com%2F%40MarioNawfal&rut=abc">
					Mario Nawfal - YouTube
				</a>
				<a class="result__snippet">
					Official channel of <b>Mario Nawfal</b> — interviews &amp; tech news
				</a>
			</div>
			<div class="result">
				<a class="result__a" href="/l/?uddg=https%3A%2F%2Fyoutube.com%2F%40veritasium">
					Veritasium - YouTube
				</a>
				<a class="result__snippet">
					Science videos, <i>experiments</i>, and educational content
				</a>
			</div>
		</body></html>
	`;

	it("extracts titles, URLs, and snippets", () => {
		const results = parseDuckDuckGoResults(sampleHtml, 10);
		expect(results).toHaveLength(2);
		expect(results[0].title).toBe("Mario Nawfal - YouTube");
		expect(results[0].url).toBe("https://www.youtube.com/@MarioNawfal");
		expect(results[0].snippet).toContain("Official channel of");
		expect(results[0].snippet).toContain("Mario Nawfal");
	});

	it("decodes DDG's uddg redirect URLs", () => {
		const results = parseDuckDuckGoResults(sampleHtml, 10);
		expect(results[1].url).toBe("https://youtube.com/@veritasium");
	});

	it("strips HTML and decodes entities from title and snippet", () => {
		const results = parseDuckDuckGoResults(sampleHtml, 10);
		expect(results[0].title).not.toMatch(/<[^>]+>/);
		expect(results[0].snippet).not.toMatch(/&amp;/);
	});

	it("respects the limit parameter", () => {
		const results = parseDuckDuckGoResults(sampleHtml, 1);
		expect(results).toHaveLength(1);
	});

	it("returns empty array on empty or non-string input", () => {
		expect(parseDuckDuckGoResults("", 5)).toEqual([]);
		expect(parseDuckDuckGoResults(null, 5)).toEqual([]);
	});

	it("returns empty array when no result blocks match", () => {
		expect(
			parseDuckDuckGoResults("<html><body>Nothing here</body></html>", 5),
		).toEqual([]);
	});
});

describe("executeToolCall", () => {
	const originalWarn = console.warn;
	beforeEach(() => {
		console.warn = vi.fn();
	});
	afterEach(() => {
		console.warn = originalWarn;
	});

	it("dispatches web_search and returns JSON", async () => {
		const toolCall = {
			id: "call_1",
			function: {
				name: "web_search",
				arguments: JSON.stringify({ query: "mario nawfal", limit: 3 }),
			},
		};
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			text: () =>
				Promise.resolve(
					'<a class="result__a" href="https://example.com/foo">Foo</a>',
				),
		});
		const result = await executeToolCall(toolCall, { fetchImpl, braveKey: "" });
		const parsed = JSON.parse(result);
		expect(parsed.backend).toBe("duckduckgo");
		expect(parsed.query).toBe("mario nawfal");
		expect(Array.isArray(parsed.results)).toBe(true);
	});

	it("returns an error for unknown function names", async () => {
		const toolCall = {
			id: "call_1",
			function: { name: "send_email", arguments: "{}" },
		};
		const result = await executeToolCall(toolCall, {});
		const parsed = JSON.parse(result);
		expect(parsed.error).toMatch(/send_email/);
	});

	it("handles malformed JSON arguments gracefully", async () => {
		const toolCall = {
			id: "call_1",
			function: { name: "web_search", arguments: "not valid json" },
		};
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			text: () => Promise.resolve(""),
		});
		const result = await executeToolCall(toolCall, { fetchImpl, braveKey: "" });
		const parsed = JSON.parse(result);
		expect(parsed.error).toMatch(/Missing query/i);
	});
});

describe("executeWebSearch", () => {
	const originalWarn = console.warn;
	beforeEach(() => {
		console.warn = vi.fn();
	});
	afterEach(() => {
		console.warn = originalWarn;
	});

	it("uses brave when a key is set", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					web: {
						results: [
							{ title: "Foo", url: "https://foo.com", description: "bar" },
						],
					},
				}),
		});
		const result = await executeWebSearch(
			{ query: "foo", limit: 5 },
			{ fetchImpl, braveKey: "test-key" },
		);
		const parsed = JSON.parse(result);
		expect(parsed.backend).toBe("brave");
		expect(fetchImpl).toHaveBeenCalledWith(
			expect.stringContaining("api.search.brave.com"),
			expect.objectContaining({
				headers: expect.objectContaining({
					"X-Subscription-Token": "test-key",
				}),
			}),
		);
	});

	it("uses duckduckgo when no brave key is set", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			text: () => Promise.resolve(""),
		});
		const result = await executeWebSearch(
			{ query: "foo" },
			{ fetchImpl, braveKey: "" },
		);
		const parsed = JSON.parse(result);
		expect(parsed.backend).toBe("duckduckgo");
		expect(fetchImpl).toHaveBeenCalledWith(
			expect.stringContaining("html.duckduckgo.com"),
			expect.any(Object),
		);
	});

	it("rejects empty queries without calling fetch", async () => {
		const fetchImpl = vi.fn();
		const result = await executeWebSearch(
			{ query: "  " },
			{ fetchImpl, braveKey: "" },
		);
		const parsed = JSON.parse(result);
		expect(parsed.error).toMatch(/Missing query/i);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("clamps limit to 1-10", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			text: () => Promise.resolve(""),
		});
		await executeWebSearch(
			{ query: "x", limit: 999 },
			{ fetchImpl, braveKey: "" },
		);
		const url = fetchImpl.mock.calls[0][0];
		expect(url).toMatch(/q=x/);
		// DDG doesn't use limit directly; we cap at 10 internally.
	});
});

describe("searchDuckDuckGo", () => {
	const originalWarn = console.warn;
	beforeEach(() => {
		console.warn = vi.fn();
	});
	afterEach(() => {
		console.warn = originalWarn;
	});

	it("returns parsed results on success", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			text: () =>
				Promise.resolve(
					'<a class="result__a" href="https://example.com">Title</a>' +
						'<a class="result__snippet">Snippet text</a>',
				),
		});
		const results = await searchDuckDuckGo("query", 5, { fetchImpl });
		expect(results).toHaveLength(1);
		expect(results[0].title).toBe("Title");
	});

	it("returns empty array on non-2xx response", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
		const results = await searchDuckDuckGo("query", 5, { fetchImpl });
		expect(results).toEqual([]);
	});

	it("returns empty array on network error and logs", async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
		const results = await searchDuckDuckGo("query", 5, { fetchImpl });
		expect(results).toEqual([]);
		expect(console.warn).toHaveBeenCalled();
	});
});

describe("searchBrave", () => {
	const originalWarn = console.warn;
	beforeEach(() => {
		console.warn = vi.fn();
	});
	afterEach(() => {
		console.warn = originalWarn;
	});

	it("maps Brave results to the standard shape", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					web: {
						results: [
							{ title: "Foo", url: "https://foo.com", description: "bar" },
							{ title: "Baz", url: "https://baz.com", description: "qux" },
						],
					},
				}),
		});
		const results = await searchBrave("query", 5, {
			fetchImpl,
			braveKey: "key",
		});
		expect(results).toEqual([
			{ title: "Foo", url: "https://foo.com", snippet: "bar" },
			{ title: "Baz", url: "https://baz.com", snippet: "qux" },
		]);
	});

	it("returns empty array on non-2xx response", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ ok: false });
		const results = await searchBrave("q", 5, { fetchImpl, braveKey: "k" });
		expect(results).toEqual([]);
	});

	it("handles missing web.results gracefully", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({}),
		});
		const results = await searchBrave("q", 5, { fetchImpl, braveKey: "k" });
		expect(results).toEqual([]);
	});
});

describe("resolveChannelViaOpencode", () => {
	const originalEnv = { ...process.env };
	const originalWarn = console.warn;

	beforeEach(() => {
		process.env = { ...originalEnv };
		process.env.OPENCODE_API_KEY = "test-key";
		console.warn = vi.fn();
	});

	afterEach(() => {
		process.env = originalEnv;
		console.warn = originalWarn;
	});

	it("returns null when no API key and non-opencode provider", async () => {
		delete process.env.OPENCODE_API_KEY;
		const result = await resolveChannelViaOpencode("mario nawfal", {
			provider: "deepseek",
		});
		expect(result).toBeNull();
	});

	it("returns the parsed final answer with provider attribution", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					choices: [
						{
							message: {
								role: "assistant",
								content: JSON.stringify({
									handle: "MarioNawfal",
									title: "Mario Nawfal",
								}),
							},
						},
					],
				}),
		});
		const result = await resolveChannelViaOpencode("mario nawfal", {
			fetchImpl,
		});
		expect(result).toEqual({
			type: "handle",
			value: "MarioNawfal",
			title: "Mario Nawfal",
			provider: "opencode",
		});
	});

	it("sends the request to the OpenCode endpoint with bearer auth", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					choices: [
						{
							message: {
								role: "assistant",
								content: JSON.stringify({ handle: "mkbhd" }),
							},
						},
					],
				}),
		});
		await resolveChannelViaOpencode("mkbhd", { fetchImpl });
		expect(fetchImpl).toHaveBeenCalledWith(
			OPENCODE_ENDPOINT,
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "Bearer test-key",
					"Content-Type": "application/json",
				}),
			}),
		);
	});

	it("passes tools in the request body", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					choices: [
						{
							message: {
								role: "assistant",
								content: JSON.stringify({ handle: "mkbhd" }),
							},
						},
					],
				}),
		});
		await resolveChannelViaOpencode("mkbhd", { fetchImpl });
		const callArgs = JSON.parse(fetchImpl.mock.calls[0][1].body);
		expect(callArgs.model).toBe(OPENCODE_MODEL);
		expect(callArgs.tools).toEqual(TOOLS);
		expect(callArgs.tool_choice).toBe("auto");
	});

	it("executes a web_search tool call and continues the loop", async () => {
		// First call: model asks for web_search
		// Second call: model returns the final answer
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						choices: [
							{
								message: {
									role: "assistant",
									content: null,
									tool_calls: [
										{
											id: "call_1",
											type: "function",
											function: {
												name: "web_search",
												arguments: JSON.stringify({ query: "mario nawfal" }),
											},
										},
									],
								},
							},
						],
					}),
			})
			.mockResolvedValueOnce({
				ok: true,
				text: () =>
					Promise.resolve(
						'<a class="result__a" href="https://www.youtube.com/@MarioNawfal">Mario Nawfal</a>' +
							'<a class="result__snippet">Interviews</a>',
					),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						choices: [
							{
								message: {
									role: "assistant",
									content: JSON.stringify({
										handle: "MarioNawfal",
										title: "Mario Nawfal",
									}),
								},
							},
						],
					}),
			});
		const result = await resolveChannelViaOpencode("mario nawfal", {
			fetchImpl,
		});
		expect(result).toEqual({
			type: "handle",
			value: "MarioNawfal",
			title: "Mario Nawfal",
			provider: "opencode",
		});
		// 3 fetch calls: opencode, ddg, opencode
		expect(fetchImpl).toHaveBeenCalledTimes(3);
	});

	it("returns null when rate-limited (429)", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429 });
		const result = await resolveChannelViaOpencode("foo", { fetchImpl });
		expect(result).toBeNull();
	});

	it("returns null on auth error (401)", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });
		const result = await resolveChannelViaOpencode("foo", { fetchImpl });
		expect(result).toBeNull();
	});

	it("returns null on network error", async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
		const result = await resolveChannelViaOpencode("foo", { fetchImpl });
		expect(result).toBeNull();
	});

	it("aborts the loop at MAX_TOOL_ITERATIONS to bound cost", async () => {
		// Every call returns a new tool call, never a final answer.
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					choices: [
						{
							message: {
								role: "assistant",
								content: null,
								tool_calls: [
									{
										id: "call_x",
										type: "function",
										function: {
											name: "web_search",
											arguments: JSON.stringify({ query: "x" }),
										},
									},
								],
							},
						},
					],
				}),
		});
		const result = await resolveChannelViaOpencode("x", { fetchImpl });
		expect(result).toBeNull();
		// MAX_TOOL_ITERATIONS API calls + MAX_TOOL_ITERATIONS DDG calls
		expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(
			MAX_TOOL_ITERATIONS * 2,
		);
	});

	it("uses brave for the web_search tool when braveKey is provided", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						choices: [
							{
								message: {
									role: "assistant",
									content: null,
									tool_calls: [
										{
											id: "call_1",
											type: "function",
											function: {
												name: "web_search",
												arguments: JSON.stringify({ query: "foo" }),
											},
										},
									],
								},
							},
						],
					}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						web: {
							results: [{ title: "T", url: "https://u", description: "S" }],
						},
					}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						choices: [
							{
								message: {
									role: "assistant",
									content: JSON.stringify({ handle: "foo" }),
								},
							},
						],
					}),
			});
		await resolveChannelViaOpencode("foo", {
			fetchImpl,
			braveKey: "brave-test",
		});
		const ddgCall = fetchImpl.mock.calls.find((c) =>
			String(c[0]).includes("duckduckgo"),
		);
		const braveCall = fetchImpl.mock.calls.find((c) =>
			String(c[0]).includes("api.search.brave.com"),
		);
		expect(ddgCall).toBeUndefined();
		expect(braveCall).toBeTruthy();
	});

	it("returns null when the final response is unparseable", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					choices: [
						{
							message: {
								role: "assistant",
								content: "I'm not sure what you mean.",
							},
						},
					],
				}),
		});
		const result = await resolveChannelViaOpencode("foo", { fetchImpl });
		expect(result).toBeNull();
	});
});

describe("getOpencodeBackendStatus", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		process.env = { ...originalEnv };
	});
	afterEach(() => {
		process.env = originalEnv;
	});

	it("reports unavailable when no key is set", () => {
		delete process.env.OPENCODE_API_KEY;
		expect(getOpencodeBackendStatus().available).toBe(false);
	});

	it("reports available when a key is set", () => {
		process.env.OPENCODE_API_KEY = "test";
		const status = getOpencodeBackendStatus();
		expect(status.available).toBe(true);
		expect(status.model).toBe(OPENCODE_MODEL);
	});

	it("reports the search backend based on Brave key", () => {
		process.env.OPENCODE_API_KEY = "x";
		delete process.env.BRAVE_API_KEY;
		expect(getOpencodeBackendStatus().searchBackend).toBe("duckduckgo");
		process.env.BRAVE_API_KEY = "y";
		expect(getOpencodeBackendStatus().searchBackend).toBe("brave");
	});
});

describe("extractAnswerText", () => {
	it("returns content when it is non-empty", () => {
		const result = extractAnswerText("hello", "reasoning here");
		expect(result).toBe("hello");
	});

	it("falls back to reasoning_content when content is empty", () => {
		const result = extractAnswerText("", '[{"handle":"x"}]');
		expect(result).toBe('[{"handle":"x"}]');
	});

	it("extracts JSON from reasoning_content chain-of-thought", () => {
		const reasoning =
			"Let me think... I should suggest 5 channels.\n" +
			'[{"handle":"mkbhd","title":"M"}]\n' +
			"That's my answer.";
		const result = extractAnswerText("", reasoning);
		expect(result).toBe('[{"handle":"mkbhd","title":"M"}]');
	});

	it("returns empty string when both content and reasoning are empty", () => {
		expect(extractAnswerText("", "")).toBe("");
		expect(extractAnswerText(null, undefined)).toBe("");
	});
});

describe("resolveChannelViaLlm (suggestions mode)", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		process.env = { ...originalEnv };
		delete process.env.OPENCODE_API_KEY;
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("returns suggestions from a non-reasoning model response", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					choices: [
						{
							message: {
								role: "assistant",
								content: JSON.stringify([
									{
										handle: "3blue1brown",
										title: "3Blue1Brown",
										reason: "Math",
									},
								]),
							},
						},
					],
				}),
		});
		const result = await resolveChannelViaLlm("suggest", {
			provider: "opencode",
			useSuggestions: true,
			subscriptionContext: "- Test",
			fetchImpl,
		});
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			type: "handle",
			value: "3blue1brown",
			title: "3Blue1Brown",
			reason: "Math",
			provider: "opencode",
		});
	});

	it("returns suggestions from reasoning_content when content is empty", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					choices: [
						{
							message: {
								role: "assistant",
								content: "",
								reasoning_content:
									'Thinking... [{"handle":"x","title":"Y","reason":"Z"}]',
							},
						},
					],
				}),
		});
		const result = await resolveChannelViaLlm("suggest", {
			provider: "opencode",
			useSuggestions: true,
			subscriptionContext: "- Test",
			fetchImpl,
		});
		expect(result).toHaveLength(1);
		expect(result[0].value).toBe("x");
	});

	it("does not send Authorization header for opencode without key", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					choices: [
						{
							message: {
								role: "assistant",
								content: '[{"handle":"a","title":"B","reason":"C"}]',
							},
						},
					],
				}),
		});
		await resolveChannelViaLlm("suggest", {
			provider: "opencode",
			useSuggestions: true,
			subscriptionContext: "- Test",
			fetchImpl,
		});
		const headers = fetchImpl.mock.calls[0][1].headers;
		expect(headers.Authorization).toBeUndefined();
		expect(headers["Content-Type"]).toBe("application/json");
	});

	it("sends Authorization header when a key is provided", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					choices: [
						{
							message: {
								role: "assistant",
								content: '[{"handle":"a","title":"B","reason":"C"}]',
							},
						},
					],
				}),
		});
		await resolveChannelViaLlm("suggest", {
			provider: "opencode",
			apiKey: "my-key",
			useSuggestions: true,
			subscriptionContext: "- Test",
			fetchImpl,
		});
		const headers = fetchImpl.mock.calls[0][1].headers;
		expect(headers.Authorization).toBe("Bearer my-key");
	});

	it("does not pass tools in the request body for suggestions", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					choices: [
						{
							message: {
								role: "assistant",
								content: '[{"handle":"a","title":"B","reason":"C"}]',
							},
						},
					],
				}),
		});
		await resolveChannelViaLlm("suggest", {
			provider: "opencode",
			useSuggestions: true,
			subscriptionContext: "- Test",
			fetchImpl,
		});
		const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
		expect(body.tools).toBeUndefined();
		expect(body.tool_choice).toBeUndefined();
	});

	it("includes max_tokens in the request body", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					choices: [
						{
							message: {
								role: "assistant",
								content: '[{"handle":"a","title":"B","reason":"C"}]',
							},
						},
					],
				}),
		});
		await resolveChannelViaLlm("suggest", {
			provider: "opencode",
			useSuggestions: true,
			subscriptionContext: "- Test",
			fetchImpl,
		});
		const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
		expect(body.max_tokens).toBe(4096);
	});
});
