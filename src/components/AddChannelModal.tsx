import { motion, AnimatePresence } from "framer-motion";
import {
	X,
	Plus,
	Check,
	AlertCircle,
	Search,
	ShieldAlert,
	CloudOff,
	Sparkles,
	RotateCw,
} from "lucide-react";
import { getDisplayText } from "../lib/youtube-parser";
import { useAddChannelSearch } from "../hooks/useAddChannelSearch";
import { useChannelSuggestions } from "../hooks/useChannelSuggestions";
import { formatSubscriberCount, formatVideoCount } from "./channelSearch";
import { AddChannelPreview } from "./AddChannelPreview";
import type { YouTubeChannel } from "../types/youtube";

interface AddChannelModalProps {
	isOpen: boolean;
	onClose: () => void;
	onAdd: (channel: YouTubeChannel) => void | Promise<void>;
	existingSubscriptions?: YouTubeChannel[];
}

export const AddChannelModal = ({
	isOpen,
	onClose,
	onAdd,
	existingSubscriptions = [],
}: AddChannelModalProps) => {
	const search = useAddChannelSearch({
		existingSubscriptions,
		onAdd,
	});
	const suggestions = useChannelSuggestions();

	return (
		isOpen ? (
			<div className="app-shell fixed inset-0 z-[100] flex h-[100dvh] flex-col overflow-hidden">
				<AddChannelHeader onClose={onClose} />
				<ModalBody
					search={search}
					suggestions={suggestions}
					existingSubscriptions={existingSubscriptions}
				/>
			</div>
		) : null
	);
};

// ─── Subcomponents ────────────────────────────────────────────────────────

function ModalBody({
	search,
	suggestions,
	existingSubscriptions,
}: {
	search: ReturnType<typeof useAddChannelSearch>;
	suggestions: ReturnType<typeof useChannelSuggestions>;
	existingSubscriptions: YouTubeChannel[];
}) {
	return (
		<div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
			<div className="p-5 space-y-6">
				<AddChannelSearchInput
					input={search.input}
					onChange={search.handleInputChange}
					onKeyDown={search.handleInputKeyDown}
					inputRef={search.inputRef}
					validationError={search.validationError}
					channelInfo={search.channelInfo}
					isValidating={search.isValidating}
					isSearching={search.isSearching}
					parsedInput={search.parsedInput}
				/>

				<SearchResultsBody
					search={search}
					suggestions={suggestions}
					existingSubscriptions={existingSubscriptions}
				/>

				<AnimatePresence>
					{search.showFormats && <SupportedFormatsSection />}
				</AnimatePresence>
			</div>
		</div>
	);
}

function SearchResultsBody({
	search,
	suggestions,
	existingSubscriptions,
}: {
	search: ReturnType<typeof useAddChannelSearch>;
	suggestions: ReturnType<typeof useChannelSuggestions>;
	existingSubscriptions: YouTubeChannel[];
}) {
	return (
		<>
			<SearchStatusDisplay
				isSearching={search.isSearching}
				hasResults={search.hasResults}
				visibleSearchResults={search.visibleSearchResults}
				previewChannel={search.previewChannel}
				addedChannelIds={search.addedChannelIds}
				channelInfo={search.channelInfo}
				searchError={search.searchError}
				input={search.input}
				isLoading={search.isLoading}
				onSelectPreview={search.handleSelectPreviewChannel}
				onAdd={search.handleAddPreviewChannel}
				onDismiss={search.handleDismissPreview}
			/>

			<ChannelAddActions
				search={search}
				suggestions={suggestions}
				existingSubscriptions={existingSubscriptions}
			/>
		</>
	);
}

function SearchStatusDisplay({
	isSearching,
	hasResults,
	visibleSearchResults,
	previewChannel,
	addedChannelIds,
	channelInfo,
	searchError,
	input,
	isLoading,
	onSelectPreview,
	onAdd,
	onDismiss,
}: {
	isSearching: boolean;
	hasResults: boolean;
	visibleSearchResults: YouTubeChannel[];
	previewChannel: YouTubeChannel | null;
	addedChannelIds: Set<string>;
	channelInfo: YouTubeChannel | null;
	searchError: "auth" | "network" | null;
	input: string;
	isLoading: boolean;
	onSelectPreview: (channel: YouTubeChannel) => void;
	onAdd: () => Promise<void>;
	onDismiss: () => void;
}) {
	return (
		<>
			<AnimatePresence>
				{isSearching && !hasResults && <SearchLoadingSkeleton />}
			</AnimatePresence>

			<AnimatePresence>
				{hasResults && (
					<SearchResultsSection
						results={visibleSearchResults}
						previewingId={previewChannel?.id ?? null}
						addedIds={addedChannelIds}
						onSelectPreview={onSelectPreview}
						renderPreview={(channel) => (
							<AddChannelPreview
								channel={channel}
								isLoading={isLoading}
								isAdded={addedChannelIds.has(channel.id)}
								onAdd={onAdd}
								onDismiss={onDismiss}
							/>
						)}
					/>
				)}
			</AnimatePresence>

			<NoResultsBlock
				isSearching={isSearching}
				input={input}
				hasResults={hasResults}
				channelInfo={channelInfo}
				searchError={searchError}
			/>

			<SearchErrorStates searchError={searchError} isSearching={isSearching} />

			<AnimatePresence>
				{channelInfo && !previewChannel && (
					<AddChannelPreview
						channel={channelInfo}
						isLoading={isLoading}
						isAdded={addedChannelIds.has(channelInfo.id)}
						onAdd={onAdd}
						onDismiss={onDismiss}
					/>
				)}
			</AnimatePresence>
		</>
	);
}

function ChannelAddActions({
	search,
	suggestions,
	existingSubscriptions,
}: {
	search: ReturnType<typeof useAddChannelSearch>;
	suggestions: ReturnType<typeof useChannelSuggestions>;
	existingSubscriptions: YouTubeChannel[];
}) {
	const showSuggestionsButton =
		!search.isSearching &&
		!search.hasResults &&
		!search.channelInfo &&
		!search.validationError &&
		!search.searchError &&
		suggestions.state.phase === "idle" &&
		search.input.trim().length < 2;

	const handleDiscover = async () => {
		if (suggestions.state.phase === "loading") return;
		await suggestions.fetchSuggestions(existingSubscriptions);
	};
	const handleClearSuggestions = () => {
		search.handleDismissPreview();
		suggestions.reset();
	};

	return (
		<>
			{!search.channelInfo && search.canAddParsedInput && (
				<AddParsedInputButton
					displayText={
						search.parsedInput
							? getDisplayText(search.parsedInput)
							: search.input.trim()
					}
					isLoading={search.isLoading}
					onAdd={search.handleAddParsedInput}
				/>
			)}

			<SuggestionsSection
				suggestions={suggestions}
				addedIds={search.addedChannelIds}
				previewChannel={search.previewChannel}
				isLoading={search.isLoading}
				onSelectPreview={search.handleSelectPreviewChannel}
				onAdd={search.handleAddPreviewChannel}
				onDismiss={search.handleDismissPreview}
				showButton={showSuggestionsButton}
				onDiscover={handleDiscover}
				onClear={handleClearSuggestions}
			/>
		</>
	);
}

// ─── Subcomponents (continued) ────────────────────────────────────────────

function NoResultsBlock({
	isSearching,
	input,
	hasResults,
	channelInfo,
	searchError,
}: {
	isSearching: boolean;
	input: string;
	hasResults: boolean;
	channelInfo: YouTubeChannel | null;
	searchError: "auth" | "network" | null;
}) {
	const showNoResults =
		!isSearching &&
		input.trim().length >= 2 &&
		!hasResults &&
		!channelInfo &&
		!searchError;

	return (
		<AnimatePresence>
			{showNoResults && <NoResultsState query={input} />}
		</AnimatePresence>
	);
}

function AddChannelHeader({ onClose }: { onClose: () => void }) {
	return (
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
								<span className="text-red-600 dark:text-red-500">Tube</span>
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
	);
}

function AddChannelSearchInput({
	input,
	onChange,
	onKeyDown,
	inputRef,
	validationError,
	channelInfo,
	isValidating,
	isSearching,
	parsedInput,
}: {
	input: string;
	onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
	inputRef: React.RefObject<HTMLInputElement | null>;
	validationError: string;
	channelInfo: YouTubeChannel | null;
	isValidating: boolean;
	isSearching: boolean;
	parsedInput: ReturnType<typeof useAddChannelSearch>["parsedInput"];
}) {
	return (
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
					onChange={onChange}
					onKeyDown={onKeyDown}
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
					{isValidating || isSearching ? (
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
	);
}

function SearchLoadingSkeleton() {
	return (
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
	);
}

function SearchResultsSection({
	results,
	previewingId,
	addedIds,
	onSelectPreview,
	renderPreview,
}: {
	results: YouTubeChannel[];
	previewingId: string | null;
	addedIds: Set<string>;
	onSelectPreview: (channel: YouTubeChannel) => void;
	renderPreview: (channel: YouTubeChannel) => React.ReactNode;
}) {
	return (
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
				</h3>
				<span className="text-xs text-gray-400">{results.length} found</span>
			</div>
			<div className="space-y-2 pr-1">
				{results.map((channel) => {
					const isAdded = addedIds.has(channel.id);
					const isPreviewing = previewingId === channel.id;
					return (
						<div key={channel.id} className="overflow-hidden rounded-xl">
							<button
								type="button"
								onClick={() => onSelectPreview(channel)}
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
									{(formatSubscriberCount(channel.subscriberCount) ||
										formatVideoCount(channel.videoCount)) && (
										<span className="mt-1 inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 dark:text-ios-400">
											{formatSubscriberCount(channel.subscriberCount) && (
												<span className="font-medium text-gray-600 dark:text-ios-300">
													{formatSubscriberCount(channel.subscriberCount)}
												</span>
											)}
											{formatVideoCount(channel.videoCount) && (
												<span>· {formatVideoCount(channel.videoCount)}</span>
											)}
										</span>
									)}
									<span className="mt-1 inline-flex items-center text-xs font-medium text-red-600 dark:text-red-400">
										View preview
									</span>
								</span>
							</button>
							<AnimatePresence>
								{isPreviewing && renderPreview(channel)}
							</AnimatePresence>
						</div>
					);
				})}
			</div>
		</motion.section>
	);
}

function NoResultsState({ query }: { query: string }) {
	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			className="text-center py-8"
		>
			<Search className="w-12 h-12 text-gray-300 dark:text-ios-700 mx-auto mb-3" />
			<p className="text-sm text-gray-500 dark:text-ios-400">
				No channels found for "{query.trim()}"
			</p>
			<p className="text-xs text-gray-400 dark:text-ios-500 mt-1">
				Try a different search term or enter a YouTube URL
			</p>
		</motion.div>
	);
}

function SearchErrorStates({
	searchError,
	isSearching,
}: {
	searchError: "auth" | "network" | null;
	isSearching: boolean;
}) {
	return (
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
						Set your Server API Token in Settings to search for channels.
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
						Search unavailable — check your connection and try again.
					</p>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

function AddParsedInputButton({
	displayText,
	isLoading,
	onAdd,
}: {
	displayText: string;
	isLoading: boolean;
	onAdd: () => Promise<void>;
}) {
	return (
		<div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-ios-800 dark:bg-ios-800/50">
			<span className="min-w-0 flex-1 text-sm text-gray-600 dark:text-ios-300">
				{displayText}
			</span>
			<button
				type="button"
				onClick={onAdd}
				disabled={isLoading}
				aria-label={`Add ${displayText}`}
				className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-red-600 text-white transition-all hover:bg-red-700 disabled:opacity-60"
			>
				{isLoading ? (
					<span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
				) : (
					<Plus className="h-5 w-5" />
				)}
			</button>
		</div>
	);
}

// ─── Suggestions Section ───────────────────────────────────────────────

function SuggestionsSection({
	suggestions,
	addedIds,
	previewChannel,
	isLoading,
	onSelectPreview,
	onAdd,
	onDismiss,
	showButton,
	onDiscover,
	onClear,
}: {
	suggestions: ReturnType<typeof useChannelSuggestions>;
	addedIds: Set<string>;
	previewChannel: YouTubeChannel | null;
	isLoading: boolean;
	onSelectPreview: (channel: YouTubeChannel) => void;
	onAdd: () => Promise<void>;
	onDismiss: () => void;
	showButton: boolean;
	onDiscover: () => Promise<void>;
	onClear: () => void;
}) {
	const { state } = suggestions;

	return (
		<>
			<AnimatePresence>
				{showButton && (
					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 10 }}
					>
						<button
							type="button"
							onClick={onDiscover}
							className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-ios-700 px-4 py-4 text-sm font-medium text-gray-600 dark:text-ios-300 transition-all hover:border-red-400 hover:text-red-600 dark:hover:border-red-500 dark:hover:text-red-400 bg-transparent"
						>
							<Sparkles className="w-5 h-5" />
							Discover Channels
						</button>
					</motion.div>
				)}
			</AnimatePresence>

			<AnimatePresence>
				{state.phase === "loading" && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="text-center py-6"
					>
						<div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
						<p className="text-sm text-gray-500 dark:text-ios-400">
							Finding channels you&apos;ll like...
						</p>
					</motion.div>
				)}
			</AnimatePresence>

			<AnimatePresence>
				{state.phase === "error" && (
					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 10 }}
						className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30"
					>
						<div className="flex items-start gap-3">
							<AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
							<div className="min-w-0">
								<p className="text-sm font-medium text-amber-800 dark:text-amber-300">
									{state.message.includes("API key")
										? "Smart Search not configured"
										: "Couldn&apos;t get suggestions"}
								</p>
								<p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
									{state.message}
								</p>
								{state.message.includes("API key") && (
									<button
										type="button"
										onClick={onDiscover}
										className="mt-2 text-xs font-medium text-red-600 hover:underline"
									>
										Try again
									</button>
								)}
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			<AnimatePresence>
				{state.phase === "results" && state.channels.length > 0 && (
					<div>
						<div className="mb-2 flex items-center justify-between">
							<p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-ios-400">
								Discovered channels
							</p>
							<button
								type="button"
								onClick={onClear}
								className="text-sm font-medium text-red-600 hover:underline"
							>
								Clear
							</button>
						</div>
						<SearchResultsSection
							results={state.channels}
							previewingId={previewChannel?.id ?? null}
							addedIds={addedIds}
							onSelectPreview={onSelectPreview}
							renderPreview={(channel) => (
								<AddChannelPreview
									channel={channel}
									isLoading={isLoading}
									isAdded={addedIds.has(channel.id)}
									onAdd={onAdd}
									onDismiss={onDismiss}
								/>
							)}
						/>
					</div>
				)}
			</AnimatePresence>

			<AnimatePresence>
				{state.phase === "results" && state.channels.length === 0 && (
					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 10 }}
						className="rounded-xl border border-gray-200 dark:border-ios-800 px-4 py-4 text-center"
					>
						<p className="text-sm text-gray-500 dark:text-ios-400 mb-3">
							No related YouTube channels were found.
						</p>
						<div className="flex items-center justify-center gap-2">
							<button
								type="button"
								onClick={onClear}
								className="text-sm font-medium text-gray-600 hover:underline dark:text-ios-300"
							>
								Clear
							</button>
							<button
								type="button"
								onClick={onDiscover}
								className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:underline"
							>
								<RotateCw className="w-4 h-4" />
								Try again
							</button>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
}

function SupportedFormatsSection() {
	return (
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
					{ label: "Channel ID", example: "UCxxxxxxxxxxxxxxxxxxxxxx" },
					{ label: "Handle", example: "@channelname" },
					{ label: "Custom URL", example: "youtube.com/c/name" },
					{ label: "Full URL", example: "youtube.com/channel/UC..." },
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
	);
}
