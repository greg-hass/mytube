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
import {
	buildChannelIdentitySet,
	getChannelIdentityKeys,
	hasChannelIdentity,
} from "../lib/channel-identity";
import type { YouTubeChannel } from "../types/youtube";
import { useAddChannelHandlers } from "./useAddChannelHandlers";

const NETWORK_ERROR = "network" as const;
const AUTH_ERROR = "auth" as const;
const RATE_LIMIT_ERROR = "rate_limit" as const;
const SERVER_ERROR = "server" as const;
export type ChannelSearchError =
	| typeof AUTH_ERROR
	| typeof NETWORK_ERROR
	| typeof RATE_LIMIT_ERROR
	| typeof SERVER_ERROR;
type ChannelIdentityInput = Pick<YouTubeChannel, "id" | "customUrl">;

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
		async (
			parsed: ParsedChannelInput,
			value: string,
			signal: AbortSignal,
		) => {
			if (parsed.type === "invalid") return;

			setIsValidating(true);
			try {
				const response = await fetch(
					`/api/channel-search?q=${encodeURIComponent(value)}`,
					{ signal, headers: buildSearchHeaders() },
				);
				if (signal.aborted) return;
				if (!response.ok) {
					setChannelInfo(null);
					return;
				}
				const data = await response.json();
				const results: YouTubeChannel[] = Array.isArray(data.results)
					? data.results
					: [];
				if (!signal.aborted) {
					setChannelInfo(results[0] ?? null);
				}
			} catch (error) {
				if ((error as Error).name !== "AbortError") {
					console.error("Channel resolution failed:", error);
					setChannelInfo(null);
				}
			} finally {
				if (!signal.aborted) {
					setIsValidating(false);
				}
			}
		},
		[],
	);

	const reset = useCallback(() => {
		setChannelInfo(null);
		setIsValidating(false);
	}, []);

	return { channelInfo, isValidating, resolveDirect, reset };
}

/**
 * Debounced keyword search. Skips direct identifiers (those are handled
 * by useDirectChannelResolution). Ranks results on the consumer side.
 */
function useKeywordChannelSearch() {
	const [searchResults, setSearchResults] = useState<YouTubeChannel[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [searchError, setSearchError] = useState<ChannelSearchError | null>(null);

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
					setSearchError(
						response.status === 401
							? AUTH_ERROR
							: response.status === 429
								? RATE_LIMIT_ERROR
								: SERVER_ERROR,
					);
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
	existingIdentityKeys: Set<string>,
	onAdd: (channel: YouTubeChannel) => void | Promise<void>,
) {
	const [isLoading, setIsLoading] = useState(false);
	const [addedChannelIds, setAddedChannelIds] = useState<Set<string>>(
		new Set(),
	);
	const [addedIdentityKeys, setAddedIdentityKeys] = useState<Set<string>>(
		new Set(),
	);
	const [validationError, setValidationError] = useState<string>("");

	const addChannel = useCallback(
		async (channel: YouTubeChannel) => {
			if (
				hasChannelIdentity(channel, existingIdentityKeys) ||
				hasChannelIdentity(channel, addedIdentityKeys)
			)
				return;

			setValidationError("");
			setIsLoading(true);
			try {
				await onAdd(channel);
				setAddedChannelIds((ids) => new Set(ids).add(channel.id));
				setAddedIdentityKeys(
					(keys) => new Set([...keys, ...getChannelIdentityKeys(channel)]),
				);
				setValidationError("");
			} catch (error) {
				console.error("Failed to add channel:", error);
				setValidationError("Failed to add channel. Please try again.");
				throw error;
			} finally {
				setIsLoading(false);
			}
		},
		[existingIdentityKeys, addedIdentityKeys, onAdd],
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
		addedIdentityKeys,
		validationError,
		addChannel,
		setError,
		clearError,
		markLoading,
	};
}

// ─── Module-level helpers (pure composition) ──────────────────────────────

/**
 * Ranks and filters keyword search results: excludes already-subscribed
 * channels (unless just added in this session), scores by relevance,
 * sorts by score then subscriber count then title.
 */
function rankSearchResults(
	results: YouTubeChannel[],
	query: string,
	existingIdentityKeys: Set<string>,
	addedIdentityKeys: Set<string>,
): YouTubeChannel[] {
	const trimmed = query.trim();
	return results
		.filter(
			(channel) =>
				!hasChannelIdentity(channel, existingIdentityKeys) ||
				hasChannelIdentity(channel, addedIdentityKeys),
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
	searchError: ChannelSearchError | null;
	addedChannelIds: Set<string>;
	isChannelKnown: (channel: ChannelIdentityInput) => boolean;
	isParsedInputKnown: boolean;
	inputRef: React.RefObject<HTMLInputElement | null>;
	canAddParsedInput: boolean;
	hasResults: boolean;
	showFormats: boolean;
	hasSubmittedSearch: boolean;
	canSubmitSearch: boolean;
	handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	handleInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
	handleSearchSubmit: () => void;
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
	const [hasSubmittedSearch, setHasSubmittedSearch] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const activeSearchControllerRef = useRef<AbortController | null>(null);

	const trimmedInput = input.trim();
	const parsedInput = useMemo<ParsedChannelInput | null>(
		() => (trimmedInput ? parseChannelInput(trimmedInput) : null),
		[trimmedInput],
	);

	const existingIdentityKeys = useMemo(
		() => buildChannelIdentitySet(existingSubscriptions),
		[existingSubscriptions],
	);

	const direct = useDirectChannelResolution();
	const keyword = useKeywordChannelSearch();
	const action = useAddChannelAction(existingIdentityKeys, onAdd);

	useEffect(
		() => () => {
			activeSearchControllerRef.current?.abort();
		},
		[],
	);

	const handleSearchSubmit = () => {
		const query = input.trim();
		activeSearchControllerRef.current?.abort();
		keyword.reset();
		direct.reset();
		setPreviewChannel(null);

		if (query.length < 2) {
			setHasSubmittedSearch(false);
			action.setError("Enter at least 2 characters to search");
			return;
		}

		const parsed = parseChannelInput(query);
		if (parsed.type === "invalid") {
			setHasSubmittedSearch(false);
			action.setError("Invalid YouTube channel format");
			return;
		}

		action.clearError();
		setHasSubmittedSearch(true);
		const controller = new AbortController();
		activeSearchControllerRef.current = controller;
		if (isDirectIdentifier(parsed, query)) {
			void direct.resolveDirect(parsed, query, controller.signal);
			return;
		}
		void keyword.performSearch(query, controller.signal);
	};

	const visibleSearchResults = useMemo(
		() =>
			rankSearchResults(
				keyword.searchResults,
				input,
				existingIdentityKeys,
				action.addedIdentityKeys,
			),
		[
			keyword.searchResults,
			input,
			existingIdentityKeys,
			action.addedIdentityKeys,
		],
	);

	const isChannelKnown = useCallback(
		(channel: ChannelIdentityInput) =>
			hasChannelIdentity(channel, existingIdentityKeys) ||
			hasChannelIdentity(channel, action.addedIdentityKeys),
		[existingIdentityKeys, action.addedIdentityKeys],
	);

	const parsedIdentitySource = useMemo(() => {
		if (!parsedInput || parsedInput.type === "invalid") return null;
		return {
			id:
				parsedInput.type === "channel_id"
					? parsedInput.value
					: `${parsedInput.type === "handle" ? "handle_" : "custom_"}${parsedInput.value}`,
			customUrl:
				parsedInput.type === "handle"
					? `/@${parsedInput.value.replace(/^@/, "")}`
					: parsedInput.type === "custom_url"
						? parsedInput.value
						: undefined,
		};
	}, [parsedInput]);

	const isParsedInputKnown = Boolean(
		parsedIdentitySource && isChannelKnown(parsedIdentitySource),
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
		onSubmitSearch: handleSearchSubmit,
	});

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		activeSearchControllerRef.current?.abort();
		activeSearchControllerRef.current = null;
		keyword.reset();
		direct.reset();
		action.clearError();
		setHasSubmittedSearch(false);
		handlers.handleInputChange(e);
	};

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
		isChannelKnown,
		isParsedInputKnown,
		inputRef,
		canAddParsedInput: canAddParsedInputCore(
			parsedInput,
			direct.channelInfo,
			input,
		),
		hasResults,
		showFormats,
		hasSubmittedSearch,
		canSubmitSearch:
			trimmedInput.length >= 2 && !keyword.isSearching && !direct.isValidating,
		handleInputChange,
		handleInputKeyDown: handlers.handleInputKeyDown,
		handleSearchSubmit,
		handleSelectPreviewChannel: handlers.handleSelectPreviewChannel,
		handleDismissPreview: handlers.handleDismissPreview,
		handleAddPreviewChannel: handlers.handleAddPreviewChannel,
		handleAddParsedInput: handlers.handleAddParsedInput,
	};
}
