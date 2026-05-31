import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Check, AlertCircle, Search, Youtube } from 'lucide-react';
import { parseChannelInput, getDisplayText, type ParsedChannelInput } from '../lib/youtube-parser';
import { fetchChannelInfoWithFallback } from '../lib/youtube-api';
import type { YouTubeChannel } from '../types/youtube';

interface AddChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (channel: YouTubeChannel) => void;
  existingSubscriptions?: YouTubeChannel[];
}

export const AddChannelModal = ({ isOpen, onClose, onAdd, existingSubscriptions = [] }: AddChannelModalProps) => {
  const [input, setInput] = useState('');
  const [parsedInput, setParsedInput] = useState<ParsedChannelInput | null>(null);
  const [channelInfo, setChannelInfo] = useState<YouTubeChannel | null>(null);
  const [searchResults, setSearchResults] = useState<YouTubeChannel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [addingChannelIds, setAddingChannelIds] = useState<Set<string>>(new Set());
  const [addedChannelIds, setAddedChannelIds] = useState<Set<string>>(new Set());
  const [isValidating, setIsValidating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [validationError, setValidationError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const existingIds = useMemo(() => new Set(existingSubscriptions.map((sub) => sub.id)), [existingSubscriptions]);
  const visibleSearchResults = useMemo(
    () => searchResults.filter((channel) => !existingIds.has(channel.id) || addedChannelIds.has(channel.id)),
    [addedChannelIds, existingIds, searchResults]
  );

  // Validate input whenever it changes
  useEffect(() => {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      setParsedInput(null);
      setChannelInfo(null);
      setSearchResults([]);
      setValidationError('');
      return;
    }

    const parsed = parseChannelInput(trimmedInput);
    const canResolveDirectly =
      parsed.type === 'channel_id' ||
      parsed.type === 'handle' ||
      trimmedInput.includes('youtube.com');

    setParsedInput(parsed);

    if (parsed.type === 'invalid') {
      setValidationError('Invalid YouTube channel format');
      setChannelInfo(null);
    } else if (canResolveDirectly) {
      setValidationError('');
      // Auto-fetch channel info for valid inputs
      void fetchChannelInfo(parsed);
    } else {
      setValidationError('');
      setChannelInfo(null);
    }
  }, [input]);

  useEffect(() => {
    const query = input.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/channel-search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Search failed with ${response.status}`);
        }

        const data = await response.json();
        const results = Array.isArray(data.results) ? data.results : [];
        setSearchResults(results);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Channel keyword search failed:', error);
          setSearchResults([]);
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

  const fetchChannelInfo = async (parsed: ParsedChannelInput) => {
    if (parsed.type === 'invalid') return;

    setIsValidating(true);
    try {
      // Try to get YouTube API key from environment or use fallback
      const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;
      const info = await fetchChannelInfoWithFallback(parsed, apiKey);

      if (info) {
        setChannelInfo(info);
        setValidationError('');
      } else {
        setValidationError('Unable to fetch channel information. This may happen without an API key. The channel will still be added with basic information.');
        setChannelInfo(null);
      }
    } catch (error) {
      console.error('Error fetching channel info:', error);
      setValidationError('Unable to fetch channel information. The channel will still be added with basic information.');
      setChannelInfo(null);
    } finally {
      setIsValidating(false);
    }
  };

  const createChannelFromParsedInput = async () => {
    if (!parsedInput || parsedInput.type === 'invalid') {
      throw new Error('Search for a channel or enter a valid YouTube channel');
    }

    let channelToAdd = channelInfo;

    if (!channelToAdd) {
      let resolvedId = parsedInput.value;

      if (parsedInput.type === 'handle' || parsedInput.type === 'custom_url') {
        const resolveResponse = await fetch('/api/resolve-channel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: parsedInput.type,
            value: parsedInput.value
          })
        });

        if (!resolveResponse.ok) {
          throw new Error('Unable to resolve channel. Please try a different URL or the channel ID directly.');
        }

        const { channelId, title, thumbnail } = await resolveResponse.json();
        resolvedId = channelId;

        channelToAdd = {
          id: channelId,
          title: title || parsedInput.originalInput,
          description: '',
          thumbnail: thumbnail || `https://ui-avatars.com/api/?name=${encodeURIComponent(parsedInput.originalInput)}&background=random&color=fff`,
          customUrl: parsedInput.type === 'custom_url' ? parsedInput.value : undefined,
        };
      } else {
        channelToAdd = {
          id: resolvedId,
          title: parsedInput.originalInput,
          description: '',
          thumbnail: `https://ui-avatars.com/api/?name=${encodeURIComponent(parsedInput.originalInput)}&background=random&color=fff`,
        };
      }
    }

    return channelToAdd;
  };

  const addChannel = async (channel: YouTubeChannel) => {
    if (existingIds.has(channel.id) || addedChannelIds.has(channel.id)) return;

    setAddingChannelIds((ids) => new Set(ids).add(channel.id));
    setValidationError('');
    setIsLoading(true);
    try {
      await onAdd(channel);
      setAddedChannelIds((ids) => new Set(ids).add(channel.id));
      setValidationError('');
    } catch (error) {
      console.error('Failed to add channel:', error);
      setValidationError('Failed to add channel. Please try again.');
    } finally {
      setAddingChannelIds((ids) => {
        const nextIds = new Set(ids);
        nextIds.delete(channel.id);
        return nextIds;
      });
      setIsLoading(false);
    }
  };

  const handleAddParsedInput = async () => {
    try {
      const channelToAdd = await createChannelFromParsedInput();
      await addChannel(channelToAdd);
    } catch (error) {
      console.error('Failed to prepare channel:', error);
      setValidationError(error instanceof Error ? error.message : 'Failed to add channel. Please try again.');
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Dismiss the mobile keyboard by blurring the input
      inputRef.current?.blur();
    }
  };

  const canAddParsedInput =
    Boolean(channelInfo) ||
    parsedInput?.type === 'channel_id' ||
    parsedInput?.type === 'handle' ||
    (parsedInput?.type === 'custom_url' && input.includes('youtube.com'));

  const hasResults = visibleSearchResults.length > 0;
  const showFormats = !hasResults && !channelInfo && !isSearching && input.trim().length < 2;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-[100] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-xl bg-white dark:bg-gray-900 md:rounded-2xl shadow-2xl flex flex-col h-[100dvh] md:h-auto md:max-h-[85vh] overflow-hidden border border-gray-200 dark:border-gray-800 pt-[env(safe-area-inset-top)] md:pt-0"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-md shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-600 to-red-500 flex items-center justify-center shadow-md">
                  <Youtube className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                  Add Channel
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content — scrollable area */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              <div className="p-5 space-y-6">
                {/* Search Input */}
                <section className="space-y-3">
                  <label
                    htmlFor="channelInput"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
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
                      className={`w-full pl-4 pr-10 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border transition-all outline-none text-sm ${validationError
                        ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-red-800'
                        : channelInfo
                          ? 'border-green-300 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 dark:border-green-800'
                          : 'border-gray-200 dark:border-gray-700 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                        }`}
                      required
                      autoFocus
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

                  {/* Validation status */}
                  {validationError && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {validationError}
                    </p>
                  )}

                  {parsedInput && parsedInput.type !== 'invalid' && !validationError && channelInfo && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
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
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                        Searching...
                      </div>
                      <div className="space-y-2 pr-1">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30 p-3">
                            <div className="h-11 w-11 flex-none rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
                            <div className="flex-1 space-y-2">
                              <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                              <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
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
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                          <Search className="w-4 h-4 text-red-600" />
                          Search Results
                          {isSearching && (
                            <span className="text-xs text-gray-400 font-normal">updating...</span>
                          )}
                        </h3>
                        <span className="text-xs text-gray-400">
                          {visibleSearchResults.length} found
                        </span>
                      </div>
                      <div className="space-y-2 pr-1">
                        {visibleSearchResults.map((channel) => {
                          const isAdded = addedChannelIds.has(channel.id);
                          const isAdding = addingChannelIds.has(channel.id);
                          return (
                            <div
                              key={channel.id}
                              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all ${isAdded
                                ? 'border-green-200 bg-green-50 dark:border-green-900/60 dark:bg-green-950/20'
                                : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-800/50 dark:hover:border-gray-700 dark:hover:bg-gray-800'
                                }`}
                            >
                              <img
                                src={channel.thumbnail || `https://ui-avatars.com/api/?name=${encodeURIComponent(channel.title)}&background=random&color=fff`}
                                alt={channel.title}
                                className="h-11 w-11 flex-none rounded-full object-cover"
                                onError={(event) => {
                                  event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(channel.title)}&background=random&color=fff`;
                                }}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                  <span className="block truncate font-medium text-gray-900 dark:text-gray-100">
                                    {channel.title}
                                  </span>
                                  {isAdded && (
                                    <span className="shrink-0 inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                                      Added
                                    </span>
                                  )}
                                </span>
                                {channel.description && (
                                  <span className="line-clamp-1 text-sm text-gray-500 dark:text-gray-400">
                                    {channel.description}
                                  </span>
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() => addChannel(channel)}
                                disabled={isAdded || isAdding}
                                aria-label={isAdded ? `${channel.title} added` : `Add ${channel.title}`}
                                className={`flex h-10 w-10 flex-none items-center justify-center rounded-full transition-all ${isAdded
                                  ? 'bg-green-600 text-white'
                                  : 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-60'
                                  }`}
                              >
                                {isAdding ? (
                                  <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                                ) : isAdded ? (
                                  <Check className="h-5 w-5" />
                                ) : (
                                  <Plus className="h-5 w-5" />
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </motion.section>
                  )}
                </AnimatePresence>

                {/* No Results State */}
                <AnimatePresence>
                  {!isSearching && input.trim().length >= 2 && !hasResults && !channelInfo && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-center py-8"
                    >
                      <Search className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No channels found for "{input.trim()}"
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Try a different search term or enter a YouTube URL
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Channel Preview */}
                <AnimatePresence>
                  {channelInfo && (
                    <motion.section
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4"
                    >
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-600" />
                        Channel Preview
                      </h3>
                      <div className="flex items-start gap-3">
                        <img
                          src={channelInfo.thumbnail}
                          alt={channelInfo.title}
                          className="w-14 h-14 rounded-full object-cover flex-none"
                          onError={(e) => {
                            e.currentTarget.src = '';
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {channelInfo.title}
                          </h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                            {channelInfo.description || 'No description available'}
                          </p>
                          {channelInfo.subscriberCount && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                              {parseInt(channelInfo.subscriberCount).toLocaleString()} subscribers
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleAddParsedInput}
                          disabled={isLoading || existingIds.has(channelInfo.id) || addedChannelIds.has(channelInfo.id)}
                          aria-label={addedChannelIds.has(channelInfo.id) ? `${channelInfo.title} added` : `Add ${channelInfo.title}`}
                          className={`flex h-10 w-10 flex-none items-center justify-center rounded-full transition-all ${addedChannelIds.has(channelInfo.id)
                            ? 'bg-green-600 text-white'
                            : 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-60'
                            }`}
                        >
                          {addingChannelIds.has(channelInfo.id) ? (
                            <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                          ) : addedChannelIds.has(channelInfo.id) ? (
                            <Check className="h-5 w-5" />
                          ) : (
                            <Plus className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </motion.section>
                  )}
                </AnimatePresence>

                {!channelInfo && canAddParsedInput && (
                  <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
                    <span className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-300">
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
                      className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30 p-4 space-y-3"
                    >
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Supported formats
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                          { label: 'Channel ID', example: 'UCxxxxxxxxxxxxxxxxxxxxxx' },
                          { label: 'Handle', example: '@channelname' },
                          { label: 'Custom URL', example: 'youtube.com/c/name' },
                          { label: 'Full URL', example: 'youtube.com/channel/UC...' },
                        ].map((format) => (
                          <div
                            key={format.label}
                            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5"
                          >
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{format.label}</p>
                            <code className="text-xs text-gray-800 dark:text-gray-200 font-mono mt-0.5 block">
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
