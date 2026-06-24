import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	X,
	Plus,
	Check,
	AlertCircle,
	Search,
	Youtube,
	ShieldAlert,
	CloudOff,
} from "lucide-react";
import {
	parseChannelInput,
	getDisplayText,
	type ParsedChannelInput,
} from "../lib/youtube-parser";
import type { YouTubeChannel } from "../types/youtube";

function normalizeSearchText(value: string) {
	return String(value || "")
		.toLowerCase()
		.replace(/^@/, "")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function compactSearchText(value: string) {
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

// Strip stopwords so "the best woodworking channels" ranks against
// "woodworking", not the full natural-language phrase.
function getMeaningfulSearchText(query: string): string {
	const tokens = normalizeSearchText(query)
		.split(" ")
		.filter((token) => token && !STOPWORDS.has(token));
	return tokens.length > 0 ? tokens.join(" ") : "";
}

function scoreSearchResult(query: string, channel: YouTubeChannel) {
	const queryText =
		getMeaningfulSearchText(query) || normalizeSearchText(query);
	const compactQuery = compactSearchText(queryText);
	if (!queryText) return 0;

	const queryTokens = queryText.split(" ").filter(Boolean);
	if (queryTokens.length === 0) return 0;

	const title = normalizeSearchText(channel.title);
	const compactTitle = compactSearchText(channel.title);
	const description = normalizeSearchText(channel.description || "");
	const customUrl = normalizeSearchText(channel.customUrl || "");
	const haystack = `${title} ${description} ${customUrl}`.trim();
	const compactHaystack = compactSearchText(haystack);

	if (!haystack) return 0;

	let score = 0;
	if (title === queryText || customUrl === queryText) score += 120;
	if (compactTitle === compactQuery || customUrl === compactQuery) score += 100;
	if (title.startsWith(queryText) || customUrl.startsWith(queryText))
		score += 60;
	if (title.includes(queryText)) score += 30;
	if (compactQuery && compactHaystack.includes(compactQuery)) score += 28;
	if (description.includes(queryText) || customUrl.includes(queryText))
		score += 18;

	const matchedTokens = queryTokens.filter((token) =>
		haystack.includes(token),
	).length;
	score += Math.round((matchedTokens / queryTokens.length) * 50);

	if (title.startsWith(queryTokens[0])) score += 8;
	if (description.includes(queryTokens[0])) score += 4;

	return score;
}

function dedupeChannels(channels: YouTubeChannel[]) {
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

function formatSubscriberCount(value?: string) {
	if (!value) return null;

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) return value;

	return `${parsed.toLocaleString()} subscribers`;
}

function formatVideoCount(value?: string) {
	if (!value) return null;

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) return value;

	return `${parsed.toLocaleString()} videos`;
}

function subscriberCountForSort(channel: YouTubeChannel): number {
	const parsed = Number.parseInt(channel.subscriberCount || "", 10);
	return Number.isFinite(parsed) ? parsed : 0;
}

interface AddChannelModalProps {
	isOpen: boolean;
	onClose: () => void;
	onAdd: (channel: YouTubeChannel) => void;
	existingSubscriptions?: YouTubeChannel[];
}

export const AddChannelModal = ({
	isOpen,
	onClose,
	onAdd,
	existingSubscriptions = [],
}: AddChannelModalProps) => {
	const [input, setInput] = useState("");
	const [parsedInput, setParsedInput] = useState<ParsedChannelInput | null>(
		null,
	);
	const [channelInfo, setChannelInfo] = useState<YouTubeChannel | null>(null);
	const [searchResults, setSearchResults] = useState<YouTubeChannel[]>([]);
	const [previewChannel, setPreviewChannel] = useState<YouTubeChannel | null>(
		null,
	);
	const [isLoading, setIsLoading] = useState(false);
	const [addedChannelIds, setAddedChannelIds] = useState<Set<string>>(
		new Set(),
	);
	const [isSearching, setIsSearching] = useState(false);
	const [validationError, setValidationError] = useState<string>("");
	const [searchError, setSearchError] = useState<"auth" | "network" | null>(
		null,
	);
	const inputRef = useRef<HTMLInputElement>(null);

	const existingIds = useMemo(
		() => new Set(existingSubscriptions.map((sub) => sub.id)),
		[existingSubscriptions],
	);
	const visibleSearchResults = useMemo(
		() =>
			searchResults
				.filter(
					(channel) =>
						!existingIds.has(channel.id) || addedChannelIds.has(channel.id),
				)
				.map((channel) => ({
					channel,
					score: scoreSearchResult(input.trim(), channel),
				}))
				.sort(
					(a, b) =>
						b.score - a.score ||
						subscriberCountForSort(b.channel) -
							subscriberCountForSort(a.channel) ||
						a.channel.title.localeCompare(b.channel.title),
				)
				.map(({ channel }) => channel),
		[addedChannelIds, existingIds, input, searchResults],
	);

	// Validate input whenever it changes
	useEffect(() => {
		const trimmedInput = input.trim();

		if (!trimmedInput) {
			setParsedInput(null);
			setChannelInfo(null);
			setSearchResults([]);
			setPreviewChannel(null);
			setValidationError("");
			return;
		}

		const parsed = parseChannelInput(trimmedInput);

		setParsedInput(parsed);

		if (parsed.type === "invalid") {
			setValidationError("Invalid YouTube channel format");
			setChannelInfo(null);
			setPreviewChannel(null);
		} else {
			setValidationError("");
			setChannelInfo(null);
			// Don't auto-fetch channel info — the /api/channel-search effect
			// handles all resolution (direct identifiers and keywords) via
			// the server, which has the YouTube API key and resolves via
			// channels.list (1 quota unit, exact match).
		}
	}, [input]);

	useEffect(() => {
		const query = input.trim();
		if (query.length < 2) {
			setSearchResults([]);
			setSearchError(null);
			setIsSearching(false);
			return;
		}

		const controller = new AbortController();
		const timeout = window.setTimeout(async () => {
			setSearchError(null);
			setIsSearching(true);
			try {
				const response = await fetch(
					`/api/channel-search?q=${encodeURIComponent(query)}`,
					{
						signal: controller.signal,
					},
				);

				if (!response.ok) {
					setSearchResults([]);
					setSearchError(response.status === 401 ? "auth" : "network");
					return;
				}

				const data = await response.json();
				const results = Array.isArray(data.results) ? data.results : [];
				setSearchResults(dedupeChannels(results));
			} catch (error) {
				if ((error as Error).name !== "AbortError") {
					console.error("Channel keyword search failed:", error);
					setSearchResults([]);
					setSearchError("network");
				}
			} finally {
				if (!controller.signal.aborted) {
					setIsSearching(false);
				}
			}
		}, 150);

		return () => {
			controller.abort();
			window.clearTimeout(timeout);
		};
	}, [input]);

	const createChannelFromParsedInput = async () => {
		if (!parsedInput || parsedInput.type === "invalid") {
			throw new Error("Search for a channel or enter a valid YouTube channel");
		}

		let channelToAdd = channelInfo;

		if (!channelToAdd) {
			let resolvedId = parsedInput.value;

			if (parsedInput.type === "handle" || parsedInput.type === "custom_url") {
				const resolveResponse = await fetch("/api/resolve-channel", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						type: parsedInput.type,
						value: parsedInput.value,
					}),
				});

				if (!resolveResponse.ok) {
					throw new Error(
						"Unable to resolve channel. Please try a different URL or the channel ID directly.",
					);
				}

				const { channelId, title, thumbnail } = await resolveResponse.json();
				resolvedId = channelId;

				channelToAdd = {
					id: channelId,
					title: title || parsedInput.originalInput,
					description: "",
					thumbnail:
						thumbnail ||
						`https://ui-avatars.com/api/?name=${encodeURIComponent(parsedInput.originalInput)}&background=random&color=fff`,
					customUrl:
						parsedInput.type === "custom_url" ? parsedInput.value : undefined,
				};
			} else {
				channelToAdd = {
					id: resolvedId,
					title: parsedInput.originalInput,
					description: "",
					thumbnail: `https://ui-avatars.com/api/?name=${encodeURIComponent(parsedInput.originalInput)}&background=random&color=fff`,
				};
			}
		}

		return channelToAdd;
	};

	const addChannel = async (channel: YouTubeChannel) => {
		if (existingIds.has(channel.id) || addedChannelIds.has(channel.id)) return;

		setValidationError("");
		setIsLoading(true);
		try {
			await onAdd(channel);
			setAddedChannelIds((ids) => new Set(ids).add(channel.id));
			setValidationError("");
		} catch (error) {
			console.error("Failed to add channel:", error);
			setValidationError("Failed to add channel. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	const handleAddParsedInput = async () => {
		try {
			const channelToAdd = await createChannelFromParsedInput();
			await addChannel(channelToAdd);
		} catch (error) {
			console.error("Failed to prepare channel:", error);
			setValidationError(
				error instanceof Error
					? error.message
					: "Failed to add channel. Please try again.",
			);
			setIsLoading(false);
		}
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setPreviewChannel(null);
		setInput(e.target.value);
	};

	const handleSelectPreviewChannel = (channel: YouTubeChannel) => {
		setPreviewChannel(channel);
		setValidationError("");
	};

	const handleDismissPreview = () => {
		if (previewChannel) {
			setPreviewChannel(null);
			return;
		}

		setChannelInfo(null);
	};

	const handleAddPreviewChannel = async () => {
		const channelToAdd = previewChannel ?? channelInfo;
		if (!channelToAdd) return;

		await addChannel(channelToAdd);
		setPreviewChannel(null);
	};

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			// Dismiss the mobile keyboard by blurring the input
			inputRef.current?.blur();
		}
	};

	const hasResults = visibleSearchResults.length > 0;
	const canAddParsedInput =
		(Boolean(channelInfo) ||
			parsedInput?.type === "channel_id" ||
			parsedInput?.type === "handle" ||
			(parsedInput?.type === "custom_url" && input.includes("youtube.com"))) &&
		!hasResults &&
		!isSearching;
	const showFormats =
		!hasResults && !channelInfo && !isSearching && input.trim().length < 2;

	const renderChannelPreview = (channel: YouTubeChannel) => {
		const channelIsAdded =
			addedChannelIds.has(channel.id) || existingIds.has(channel.id);
		const subscriberCount = formatSubscriberCount(channel.subscriberCount);
		const videoCount = formatVideoCount(channel.videoCount);

		return (
			<motion.section
				initial={{ opacity: 0, y: -4 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: -4 }}
				className="rounded-b-xl border-x border-b border-gray-200 bg-white p-4 shadow-sm dark:border-ios-800 dark:bg-ios-900"
			>
				<h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
					<Youtube className="w-4 h-4 text-red-600" />
					Channel Preview
				</h3>
				<div className="flex items-start gap-3">
					<img
						src={
							channel.thumbnail ||
							`https://ui-avatars.com/api/?name=${encodeURIComponent(channel.title)}&background=random&color=fff`
						}
						alt={channel.title}
						className="w-16 h-16 rounded-full object-cover flex-none"
						onError={(event) => {
							event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(channel.title)}&background=random&color=fff`;
						}}
					/>
					<div className="flex-1 min-w-0">
						<h4 className="font-semibold text-gray-900 dark:text-ios-100">
							{channel.title}
						</h4>
						<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-ios-400">
							{subscriberCount && <span>{subscriberCount}</span>}
							{videoCount && <span>{videoCount}</span>}
							{channel.customUrl && <span>{channel.customUrl}</span>}
							<span className="font-mono">{channel.id}</span>
						</div>
						<p className="text-sm text-gray-600 dark:text-ios-300 mt-2">
							{channel.description ||
								"No description available from the search provider."}
						</p>
					</div>
				</div>
				<div className="mt-4 grid grid-cols-2 gap-2">
					<button
						type="button"
						onClick={handleAddPreviewChannel}
						disabled={isLoading || channelIsAdded}
						className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{isLoading ? (
							<span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
						) : channelIsAdded ? (
							<Check className="h-4 w-4" />
						) : (
							<Plus className="h-4 w-4" />
						)}
						{channelIsAdded ? "Added" : "Add"}
					</button>
					<button
						type="button"
						onClick={handleDismissPreview}
						className="inline-flex h-11 items-center justify-center rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-800 ring-1 ring-gray-200 transition-colors hover:bg-gray-200 dark:bg-ios-800 dark:text-ios-100 dark:ring-ios-700 dark:hover:bg-ios-700"
					>
						Dismiss
					</button>
				</div>
			</motion.section>
		);
	};

	return (
		<AnimatePresence>
			{isOpen && (
				<>
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="app-shell fixed inset-0 z-[100] flex h-[100dvh] flex-col overflow-hidden"
					>
						{/* Header */}
						<div className="sticky top-0 z-10 glass safe-top border-b border-gray-200 dark:border-ios-800/80 shadow-sm shrink-0">
							<div className="max-w-7xl mx-auto px-4">
								<div className="flex h-[var(--app-header-height)] items-center justify-between gap-3 xl:gap-4">
									<motion.div
										whileHover={{ scale: 1.03 }}
										className="flex items-center gap-3 min-w-0"
									>
										<img
											src="/icon-192.png"
											alt="MyTube"
											className="h-10 w-10 rounded-xl shadow-lg flex-none"
										/>
										<div className="min-w-0">
											<h1 className="text-lg md:text-xl font-bold tracking-tight">
												<span className="text-white dark:text-ios-50">My</span>
												<span className="text-red-600 dark:text-red-500">
													Tube
												</span>
											</h1>
											<div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-ios-400">
												<p>Add Channel</p>
											</div>
										</div>
									</motion.div>

									<button
										onClick={onClose}
										aria-label="Close add channel"
										className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-ios-400 dark:hover:bg-ios-800 dark:hover:text-white"
									>
										<X className="w-5 h-5" />
									</button>
								</div>
							</div>
						</div>

						{/* Content — scrollable area */}
						<div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
							<div className="p-5 space-y-6">
								{/* Search Input */}
								<section className="space-y-3">
									<label
										htmlFor="channelInput"
										className="text-sm font-medium text-gray-700 dark:text-ios-300"
									>
										YouTube Channel
									</label>
									<div className="relative">
										<input
											ref={inputRef}
											type="text"
											id="channelInput"
											value={input}
											onChange={handleInputChange}
											onKeyDown={handleInputKeyDown}
											placeholder="Search keywords, @handle, channel ID, or URL"
											className={`w-full pl-4 pr-10 py-2.5 rounded-lg bg-gray-50 dark:bg-ios-800/50 border transition-all outline-none text-sm ${
												validationError
													? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-red-800"
													: channelInfo
														? "border-green-300 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 dark:border-green-800"
														: "border-gray-200 dark:border-ios-700 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
											}`}
											required
										/>
										<div className="absolute right-3 top-1/2 -translate-y-1/2">
											{isSearching ? (
												<div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
											) : channelInfo ? (
												<Check className="w-5 h-5 text-green-500" />
											) : validationError ? (
												<AlertCircle className="w-5 h-5 text-red-500" />
											) : (
												<Search className="w-5 h-5 text-gray-400" />
											)}
										</div>
									</div>

									{/* Validation status */}
									{validationError && (
										<p className="text-sm text-red-600 dark:text-red-400">
											{validationError}
										</p>
									)}

									{parsedInput &&
										parsedInput.type !== "invalid" &&
										!validationError &&
										channelInfo && (
											<p className="text-sm text-gray-600 dark:text-ios-400">
												Detected: {getDisplayText(parsedInput)}
											</p>
										)}
								</section>

								{/* Search Loading Skeleton */}
								<AnimatePresence>
									{isSearching && !hasResults && (
										<motion.section
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											className="space-y-3"
										>
											<div className="flex items-center gap-2 text-sm text-gray-500 dark:text-ios-400">
												<div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
												Searching...
											</div>
											<div className="space-y-2 pr-1">
												{[1, 2, 3].map((i) => (
													<div
														key={i}
														className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-ios-800 bg-gray-50 dark:bg-ios-800/30 p-3"
													>
														<div className="h-11 w-11 flex-none rounded-full bg-gray-200 dark:bg-ios-700 animate-pulse" />
														<div className="flex-1 space-y-2">
															<div className="h-4 w-3/4 bg-gray-200 dark:bg-ios-700 rounded animate-pulse" />
															<div className="h-3 w-1/2 bg-gray-200 dark:bg-ios-700 rounded animate-pulse" />
														</div>
													</div>
												))}
											</div>
										</motion.section>
									)}
								</AnimatePresence>

								{/* Search Results — grow to fill space */}
								<AnimatePresence>
									{hasResults && (
										<motion.section
											initial={{ opacity: 0, height: 0 }}
											animate={{ opacity: 1, height: "auto" }}
											exit={{ opacity: 0, height: 0 }}
											className="space-y-3"
										>
											<div className="flex items-center justify-between">
												<h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
													<Search className="w-4 h-4 text-red-600" />
													Search Results
													{isSearching && (
														<span className="text-xs text-gray-400 font-normal">
															updating...
														</span>
													)}
												</h3>
												<span className="text-xs text-gray-400">
													{visibleSearchResults.length} found
												</span>
											</div>
											<div className="space-y-2 pr-1">
												{visibleSearchResults.map((channel) => {
													const isAdded = addedChannelIds.has(channel.id);
													const isPreviewing =
														previewChannel?.id === channel.id;
													return (
														<div
															key={channel.id}
															className="overflow-hidden rounded-xl"
														>
															<button
																type="button"
																onClick={() =>
																	handleSelectPreviewChannel(channel)
																}
																aria-label={`Preview ${channel.title}`}
																className={`flex w-full items-center gap-3 border p-3 text-left transition-all ${
																	isPreviewing
																		? "rounded-t-xl border-red-500 bg-red-50 dark:border-red-500/70 dark:bg-red-950/20"
																		: isAdded
																			? "rounded-xl border-green-200 bg-green-50 dark:border-green-900/60 dark:bg-green-950/20"
																			: "rounded-xl border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-ios-800 dark:bg-ios-900 dark:hover:border-ios-700 dark:hover:bg-ios-800"
																}`}
															>
																<img
																	src={
																		channel.thumbnail ||
																		`https://ui-avatars.com/api/?name=${encodeURIComponent(channel.title)}&background=random&color=fff`
																	}
																	alt={channel.title}
																	className="h-11 w-11 flex-none rounded-full object-cover"
																	onError={(event) => {
																		event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(channel.title)}&background=random&color=fff`;
																	}}
																/>
																<span className="min-w-0 flex-1">
																	<span className="flex items-center gap-2">
																		<span className="block truncate font-medium text-gray-900 dark:text-ios-100">
																			{channel.title}
																		</span>
																		{isAdded && (
																			<span className="shrink-0 inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
																				Added
																			</span>
																		)}
																	</span>
																	{channel.description && (
																		<span className="line-clamp-1 text-sm text-gray-500 dark:text-ios-400">
																			{channel.description}
																		</span>
																	)}
																	{(formatSubscriberCount(
																		channel.subscriberCount,
																	) ||
																		formatVideoCount(channel.videoCount)) && (
																		<span className="mt-1 inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 dark:text-ios-400">
																			{formatSubscriberCount(
																				channel.subscriberCount,
																			) && (
																				<span className="font-medium text-gray-600 dark:text-ios-300">
																					{formatSubscriberCount(
																						channel.subscriberCount,
																					)}
																				</span>
																			)}
																			{formatVideoCount(channel.videoCount) && (
																				<span>
																					·{" "}
																					{formatVideoCount(channel.videoCount)}
																				</span>
																			)}
																		</span>
																	)}
																	<span className="mt-1 inline-flex items-center text-xs font-medium text-red-600 dark:text-red-400">
																		View preview
																	</span>
																</span>
															</button>
															<AnimatePresence>
																{isPreviewing && renderChannelPreview(channel)}
															</AnimatePresence>
														</div>
													);
												})}
											</div>
										</motion.section>
									)}
								</AnimatePresence>

								{/* No Results State */}
								<AnimatePresence>
									{!isSearching &&
										input.trim().length >= 2 &&
										!hasResults &&
										!channelInfo &&
										!searchError && (
											<motion.div
												initial={{ opacity: 0 }}
												animate={{ opacity: 1 }}
												exit={{ opacity: 0 }}
												className="text-center py-8"
											>
												<Search className="w-12 h-12 text-gray-300 dark:text-ios-700 mx-auto mb-3" />
												<p className="text-sm text-gray-500 dark:text-ios-400">
													No channels found for "{input.trim()}"
												</p>
												<p className="text-xs text-gray-400 dark:text-ios-500 mt-1">
													Try a different search term or enter a YouTube URL
												</p>
											</motion.div>
										)}
								</AnimatePresence>

								{/* Search Error State */}
								<AnimatePresence>
									{!isSearching && searchError === "auth" && (
										<motion.div
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											className="text-center py-8"
											data-testid="channel-search-auth-error"
										>
											<ShieldAlert className="w-12 h-12 text-amber-400 dark:text-amber-500 mx-auto mb-3" />
											<p className="text-sm font-medium text-gray-700 dark:text-ios-300">
												Authentication required
											</p>
											<p className="text-xs text-gray-500 dark:text-ios-400 mt-1">
												Set your Server API Token in Settings to search for
												channels.
											</p>
										</motion.div>
									)}
									{!isSearching && searchError === "network" && (
										<motion.div
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											className="text-center py-8"
											data-testid="channel-search-network-error"
										>
											<CloudOff className="w-12 h-12 text-gray-300 dark:text-ios-700 mx-auto mb-3" />
											<p className="text-sm text-gray-500 dark:text-ios-400">
												Search unavailable — check your connection and try
												again.
											</p>
										</motion.div>
									)}
								</AnimatePresence>

								{/* Channel Preview */}
								<AnimatePresence>
									{channelInfo &&
										!previewChannel &&
										renderChannelPreview(channelInfo)}
								</AnimatePresence>

								{!channelInfo && canAddParsedInput && (
									<div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-ios-800 dark:bg-ios-800/50">
										<span className="min-w-0 flex-1 text-sm text-gray-600 dark:text-ios-300">
											{parsedInput ? getDisplayText(parsedInput) : input.trim()}
										</span>
										<button
											type="button"
											onClick={handleAddParsedInput}
											disabled={isLoading}
											aria-label={`Add ${parsedInput ? getDisplayText(parsedInput) : input.trim()}`}
											className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-red-600 text-white transition-all hover:bg-red-700 disabled:opacity-60"
										>
											{isLoading ? (
												<span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
											) : (
												<Plus className="h-5 w-5" />
											)}
										</button>
									</div>
								)}

								{/* Supported Formats */}
								<AnimatePresence>
									{showFormats && (
										<motion.section
											initial={{ opacity: 0, y: 10 }}
											animate={{ opacity: 1, y: 0 }}
											exit={{ opacity: 0, y: 10 }}
											className="rounded-xl border border-gray-100 dark:border-ios-800 bg-gray-50 dark:bg-ios-800/30 p-4 space-y-3"
										>
											<h3 className="text-sm font-semibold text-gray-900 dark:text-white">
												Supported formats
											</h3>
											<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
												{[
													{
														label: "Channel ID",
														example: "UCxxxxxxxxxxxxxxxxxxxxxx",
													},
													{ label: "Handle", example: "@channelname" },
													{
														label: "Custom URL",
														example: "youtube.com/c/name",
													},
													{
														label: "Full URL",
														example: "youtube.com/channel/UC...",
													},
												].map((format) => (
													<div
														key={format.label}
														className="rounded-lg border border-gray-200 dark:border-ios-700 bg-white dark:bg-ios-900 px-3 py-2.5"
													>
														<p className="text-xs font-medium text-gray-500 dark:text-ios-400">
															{format.label}
														</p>
														<code className="text-xs text-gray-800 dark:text-ios-200 font-mono mt-0.5 block">
															{format.example}
														</code>
													</div>
												))}
											</div>
										</motion.section>
									)}
								</AnimatePresence>
							</div>
						</div>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
};
