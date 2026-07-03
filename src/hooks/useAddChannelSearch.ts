/**
 * useAddChannelSearch — encapsulates the channel-search state machine
 * for the AddChannelModal. Composes three focused sub-hooks:
 *   - useDirectChannelResolution: @handle / channel-ID / URL identifiers
 *   - useKeywordChannelSearch: debounced keyword search + ranking
 *   - useAddChannelAction: the add-channel flow
 *
 * Each sub-hook owns a small state machine; the composer just glues
 * them together and exposes a flat API to the modal.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import {
	parseChannelInput,
	type ParsedChannelInput,
} from "../lib/youtube-parser";
import {
	dedupeChannels,
	scoreSearchResult,
	subscriberCountForSort,
} from "../components/channelSearch";
import type { YouTubeChannel } from "../types/youtube";
import { useAddChannelHandlers } from "./useAddChannelHandlers";

const SEARCH_DEBOUNCE_MS = 150;
const NETWORK_ERROR = "network" as const;
const AUTH_ERROR = "auth" as const;

function buildSearchHeaders(): HeadersInit {
	const apiKey = useStore.getState().apiKey.trim();
	return apiKey ? { "X-YouTube-Api-Key": apiKey } : {};
}

function isDirectIdentifier(
	parsed: ParsedChannelInput,
	trimmed: string,
): boolean {
	return (
		parsed.type === "channel_id" ||
		parsed.type === "handle" ||
		(parsed.type === "custom_url" && trimmed.includes("youtube.com"))
	);
}

// ─── Sub-hooks ────────────────────────────────────────────────────────────

/**
 * Resolves a direct channel identifier (@handle, channel ID, youtube.com
 * URL) via the server's channels.list path. Sets `channelInfo` on hit.
 */
function useDirectChannelResolution() {
	const [channelInfo, setChannelInfo] = useState<YouTubeChannel | null>(null);
	const [isValidating, setIsValidating] = useState(false);

	const resolveDirect = useCallback(
		async (parsed: ParsedChannelInput, value: string) => {
			if (parsed.type === "invalid") return;

			setIsValidating(true);
			try {
				const response = await fetch(
					`/api/channel-search?q=${encodeURIComponent(value)}`,
					{ headers: buildSearchHeaders() },
				);
				if (!response.ok) {
					setChannelInfo(null);
					return;
				}
				const data = await response.json();
				const results: YouTubeChannel[] = Array.isArray(data.results)
					? data.results
					: [];
				setChannelInfo(results[0] ?? null);
			} catch (error) {
				console.error("Channel resolution failed:", error);
				setChannelInfo(null);
				throw error;
			} finally {
				setIsValidating(false);
			}
		},
		[],
	);

	const reset = useCallback(() => setChannelInfo(null), []);

	return { channelInfo, isValidating, resolveDirect, reset };
}

/**
 * Debounced keyword search. Skips direct identifiers (those are handled
 * by useDirectChannelResolution). Ranks results on the consumer side.
 */
function useKeywordChannelSearch() {
	const [searchResults, setSearchResults] = useState<YouTubeChannel[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [searchError, setSearchError] = useState<"auth" | "network" | null>(
		null,
	);

	const performSearch = useCallback(
		async (query: string, signal: AbortSignal) => {
			setSearchError(null);
			setIsSearching(true);
			try {
				const response = await fetch(
					`/api/channel-search?q=${encodeURIComponent(query)}`,
					{ signal, headers: buildSearchHeaders() },
				);
				if (!response.ok) {
					setSearchResults([]);
					setSearchError(response.status === 401 ? AUTH_ERROR : NETWORK_ERROR);
					return;
				}
				const data = await response.json();
				const results = Array.isArray(data.results) ? data.results : [];
				setSearchResults(dedupeChannels(results));
			} catch (error) {
				if ((error as Error).name !== "AbortError") {
					console.error("Channel keyword search failed:", error);
					setSearchResults([]);
					setSearchError(NETWORK_ERROR);
					throw error;
				}
			} finally {
				if (!signal.aborted) {
					setIsSearching(false);
				}
			}
		},
		[],
	);

	const reset = useCallback(() => {
		setSearchResults([]);
		setSearchError(null);
		setIsSearching(false);
	}, []);

	return { searchResults, isSearching, searchError, performSearch, reset };
}

/**
 * Owns the add-channel action and the "added" tracker. Prevents
 * double-adds of the same channel.
 */
function useAddChannelAction(
	existingIds: Set<string>,
	onAdd: (channel: YouTubeChannel) => void | Promise<void>,
) {
	const [isLoading, setIsLoading] = useState(false);
	const [addedChannelIds, setAddedChannelIds] = useState<Set<string>>(
		new Set(),
	);
	const [validationError, setValidationError] = useState<string>("");

	const addChannel = useCallback(
		async (channel: YouTubeChannel) => {
			if (existingIds.has(channel.id) || addedChannelIds.has(channel.id))
				return;

			setValidationError("");
			setIsLoading(true);
			try {
				await onAdd(channel);
				setAddedChannelIds((ids) => new Set(ids).add(channel.id));
				setValidationError("");
			} catch (error) {
				console.error("Failed to add channel:", error);
				setValidationError("Failed to add channel. Please try again.");
				throw error;
			} finally {
				setIsLoading(false);
			}
		},
		[existingIds, addedChannelIds, onAdd],
	);

	const setError = useCallback((message: string) => {
		setValidationError(message);
	}, []);

	const clearError = useCallback(() => {
		setValidationError("");
	}, []);

	const markLoading = useCallback((value: { loading: boolean }) => {
		setIsLoading(value.loading);
	}, []);

	return {
		isLoading,
		addedChannelIds,
		validationError,
		addChannel,
		setError,
		clearError,
		markLoading,
	};
}

// ─── Module-level helpers (pure composition) ──────────────────────────────

type DirectResolver = ReturnType<typeof useDirectChannelResolution>;
type KeywordSearcher = ReturnType<typeof useKeywordChannelSearch>;
type ChannelAction = ReturnType<typeof useAddChannelAction>;

/**
 * Apply validation rules for the current trimmed input: resolve direct
 * identifiers, set/clear errors, and reset stale sub-hook state. Preview
 * is also cleared on every keystroke by `handleInputChange`, so the
 * `setPreviewChannel(null)` call here is belt-and-braces for the
 * programmatic reset path.
 */
function applyInputValidation(
	trimmedInput: string,
	keyword: KeywordSearcher,
	direct: DirectResolver,
	action: ChannelAction,
	setPreviewChannel: (channel: YouTubeChannel | null) => void,
): void {
	if (!trimmedInput) {
		direct.reset();
		keyword.reset();
		setPreviewChannel(null);
		action.clearError();
		return;
	}

	const parsed = parseChannelInput(trimmedInput);

	if (parsed.type === "invalid") {
		action.setError("Invalid YouTube channel format");
		direct.reset();
		setPreviewChannel(null);
	} else if (isDirectIdentifier(parsed, trimmedInput)) {
		action.clearError();
		void direct.resolveDirect(parsed, trimmedInput);
	} else {
		action.clearError();
		direct.reset();
	}
}

/**
 * Returns true when the trimmed query should skip the debounced keyword
 * search — either too short or a direct identifier (handled by the
 * validation path).
 */
function shouldSkipKeywordSearch(query: string): boolean {
	if (query.length < 2) return true;
	const parsed = parseChannelInput(query);
	return isDirectIdentifier(parsed, query);
}

/**
 * Creates a debounced search controller. Returns a cleanup function
 * suitable for use as a useEffect return value — aborts the in-flight
 * fetch and clears the pending timer.
 */
function createKeywordSearchController(
	query: string,
	keyword: KeywordSearcher,
): () => void {
	const controller = new AbortController();
	const timeout = window.setTimeout(() => {
		void keyword.performSearch(query, controller.signal);
	}, SEARCH_DEBOUNCE_MS);
	return () => {
		controller.abort();
		window.clearTimeout(timeout);
	};
}

/**
 * Ranks and filters keyword search results: excludes already-subscribed
 * channels (unless just added in this session), scores by relevance,
 * sorts by score then subscriber count then title.
 */
function rankSearchResults(
	results: YouTubeChannel[],
	query: string,
	existingIds: Set<string>,
	addedIds: Set<string>,
): YouTubeChannel[] {
	const trimmed = query.trim();
	return results
		.filter(
			(channel) => !existingIds.has(channel.id) || addedIds.has(channel.id),
		)
		.map((channel) => ({
			channel,
			score: scoreSearchResult(trimmed, channel),
		}))
		.sort(
			(a, b) =>
				b.score - a.score ||
				subscriberCountForSort(b.channel) - subscriberCountForSort(a.channel) ||
				a.channel.title.localeCompare(b.channel.title),
		)
		.map(({ channel }) => channel);
}

function canAddParsedInputCore(
	parsedInput: ParsedChannelInput | null,
	directChannelInfo: YouTubeChannel | null,
	input: string,
): boolean {
	return (
		Boolean(directChannelInfo) ||
		parsedInput?.type === "channel_id" ||
		parsedInput?.type === "handle" ||
		(parsedInput?.type === "custom_url" && input.includes("youtube.com"))
	);
}

function buildDisplayFlags(
	visibleSearchResultsLength: number,
	hasDirectChannelInfo: boolean,
	isSearching: boolean,
	trimmedInputLength: number,
): { hasResults: boolean; showFormats: boolean } {
	const hasResults = visibleSearchResultsLength > 0;
	const showFormats =
		!hasResults &&
		!hasDirectChannelInfo &&
		!isSearching &&
		trimmedInputLength < 2;
	return { hasResults, showFormats };
}

// ─── Main composable hook ────────────────────────────────────────────────

export interface UseAddChannelSearchOptions {
	existingSubscriptions: YouTubeChannel[];
	onAdd: (channel: YouTubeChannel) => void | Promise<void>;
}

export interface UseAddChannelSearchResult {
	input: string;
	setInput: (value: string) => void;
	parsedInput: ParsedChannelInput | null;
	channelInfo: YouTubeChannel | null;
	searchResults: YouTubeChannel[];
	visibleSearchResults: YouTubeChannel[];
	previewChannel: YouTubeChannel | null;
	isLoading: boolean;
	isValidating: boolean;
	isSearching: boolean;
	validationError: string;
	searchError: "auth" | "network" | null;
	addedChannelIds: Set<string>;
	inputRef: React.RefObject<HTMLInputElement | null>;
	canAddParsedInput: boolean;
	hasResults: boolean;
	showFormats: boolean;
	handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	handleInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
	handleSelectPreviewChannel: (channel: YouTubeChannel) => void;
	handleDismissPreview: () => void;
	handleAddPreviewChannel: () => Promise<void>;
	handleAddParsedInput: () => Promise<void>;
}

export function useAddChannelSearch(
	options: UseAddChannelSearchOptions,
): UseAddChannelSearchResult {
	const { existingSubscriptions, onAdd } = options;

	const [input, setInput] = useState("");
	const [previewChannel, setPreviewChannel] = useState<YouTubeChannel | null>(
		null,
	);
	const inputRef = useRef<HTMLInputElement>(null);

	const trimmedInput = input.trim();
	const parsedInput = useMemo<ParsedChannelInput | null>(
		() => (trimmedInput ? parseChannelInput(trimmedInput) : null),
		[trimmedInput],
	);

	const existingIds = useMemo(
		() => new Set(existingSubscriptions.map((sub) => sub.id)),
		[existingSubscriptions],
	);

	const direct = useDirectChannelResolution();
	const keyword = useKeywordChannelSearch();
	const action = useAddChannelAction(existingIds, onAdd);

	// Latest-value refs for sub-hook wrapper objects. The effects below
	// read functions (reset, performSearch, clearError, etc.) through
	// these refs so they only re-run on primitive-value changes — not on
	// every render where direct/keyword/action happen to be fresh wrapper
	// objects around stable useCallbacks. (Wrapper objects are returned
	// by sub-hooks as new references every render; depending on them
	// directly causes an infinite re-render loop — see AddChannelModal
	// test commit for detailed analysis.)
	const directRef = useRef(direct);
	useEffect(() => {
		directRef.current = direct;
	});
	const actionRef = useRef(action);
	useEffect(() => {
		actionRef.current = action;
	});
	const keywordRef = useRef(keyword);
	useEffect(() => {
		keywordRef.current = keyword;
	});

	// Side-effects driven by input changes (resolution + resets).
	// parsedInput is derived via useMemo above — no setState needed here.
	// Only the trimmed input matters as a dep; the hook objects are
	// accessed via stable refs (their functions are useCallbacks with
	// empty dep arrays).

	useEffect(() => {
		applyInputValidation(
			trimmedInput,
			keywordRef.current,
			directRef.current,
			actionRef.current,
			setPreviewChannel,
		);
	}, [trimmedInput]);

	// Debounced keyword search — only re-runs when input changes.
	useEffect(() => {
		const query = input.trim();
		if (shouldSkipKeywordSearch(query)) {
			keywordRef.current.reset();
			return;
		}
		return createKeywordSearchController(query, keywordRef.current);
	}, [input]);

	const visibleSearchResults = useMemo(
		() =>
			rankSearchResults(
				keyword.searchResults,
				input,
				existingIds,
				action.addedChannelIds,
			),
		[keyword.searchResults, input, existingIds, action.addedChannelIds],
	);

	const handlers = useAddChannelHandlers({
		inputRef,
		setInput,
		setPreviewChannel,
		previewChannel,
		directReset: direct.reset,
		directChannelInfo: direct.channelInfo,
		parsedInput,
		actionClearError: action.clearError,
		actionSetError: action.setError,
		actionMarkLoading: action.markLoading,
		actionAddChannel: action.addChannel,
	});

	const { hasResults, showFormats } = buildDisplayFlags(
		visibleSearchResults.length,
		Boolean(direct.channelInfo),
		keyword.isSearching,
		trimmedInput.length,
	);

	return {
		input,
		setInput,
		parsedInput,
		channelInfo: direct.channelInfo,
		searchResults: keyword.searchResults,
		visibleSearchResults,
		previewChannel,
		isLoading: action.isLoading,
		isValidating: direct.isValidating,
		isSearching: keyword.isSearching,
		validationError: action.validationError,
		searchError: keyword.searchError,
		addedChannelIds: action.addedChannelIds,
		inputRef,
		canAddParsedInput: canAddParsedInputCore(
			parsedInput,
			direct.channelInfo,
			input,
		),
		hasResults,
		showFormats,
		handleInputChange: handlers.handleInputChange,
		handleInputKeyDown: handlers.handleInputKeyDown,
		handleSelectPreviewChannel: handlers.handleSelectPreviewChannel,
		handleDismissPreview: handlers.handleDismissPreview,
		handleAddPreviewChannel: handlers.handleAddPreviewChannel,
		handleAddParsedInput: handlers.handleAddParsedInput,
	};
}
