import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Check, AlertCircle, Search, Youtube } from 'lucide-react';
import { parseChannelInput, getDisplayText, type ParsedChannelInput } from '../lib/youtube-parser';
import { fetchChannelInfoWithFallback } from '../lib/youtube-api';
import type { YouTubeChannel } from '../types/youtube';

interface AddChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (channel: YouTubeChannel) => void;
}

export const AddChannelModal = ({ isOpen, onClose, onAdd }: AddChannelModalProps) => {
  const [input, setInput] = useState('');
  const [parsedInput, setParsedInput] = useState<ParsedChannelInput | null>(null);
  const [channelInfo, setChannelInfo] = useState<YouTubeChannel | null>(null);
  const [searchResults, setSearchResults] = useState<YouTubeChannel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [validationError, setValidationError] = useState<string>('');

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
    }, 300);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!channelInfo && (!parsedInput || parsedInput.type === 'invalid')) {
      setValidationError('Search for a channel or enter a valid YouTube channel');
      return;
    }

    setIsLoading(true);
    try {
      // Use fetched channel info or create a basic one from parsed input
      let channelToAdd = channelInfo;

      if (!channelToAdd) {
        if (!parsedInput || parsedInput.type === 'invalid') {
          setValidationError('Choose a channel from the search results');
          setIsLoading(false);
          return;
        }

        // If we don't have channel info, we need to resolve handles/custom URLs to real IDs
        // This prevents storing handle_ or custom_ IDs in the database
        let resolvedId = parsedInput.value;

        if (parsedInput.type === 'handle' || parsedInput.type === 'custom_url') {
          try {
            // Ask server to resolve the handle/custom URL to a real channel ID
            const resolveResponse = await fetch('/api/resolve-channel', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: parsedInput.type,
                value: parsedInput.value
              })
            });

            if (resolveResponse.ok) {
              const { channelId, title, thumbnail } = await resolveResponse.json();
              resolvedId = channelId;

              // Use the resolved info
              channelToAdd = {
                id: channelId,
                title: title || parsedInput.originalInput,
                description: '',
                thumbnail: thumbnail || `https://ui-avatars.com/api/?name=${encodeURIComponent(parsedInput.originalInput)}&background=random&color=fff`,
                customUrl: parsedInput.type === 'custom_url' ? parsedInput.value : undefined,
              };
            } else {
              throw new Error('Failed to resolve channel');
            }
          } catch (err) {
            console.error('Failed to resolve handle/custom URL:', err);
            setValidationError('Unable to resolve channel. Please try a different URL or the channel ID directly.');
            setIsLoading(false);
            return;
          }
        } else {
          // For direct channel IDs, just use them as-is
          channelToAdd = {
            id: resolvedId,
            title: parsedInput.originalInput,
            description: '',
            thumbnail: `https://ui-avatars.com/api/?name=${encodeURIComponent(parsedInput.originalInput)}&background=random&color=fff`,
          };
        }
      }

      await onAdd(channelToAdd);
      setInput('');
      setParsedInput(null);
      setChannelInfo(null);
      setValidationError('');
      onClose();
    } catch (error) {
      console.error('Failed to add channel:', error);
      setValidationError('Failed to add channel. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const canSubmit =
    Boolean(channelInfo) ||
    parsedInput?.type === 'channel_id' ||
    parsedInput?.type === 'handle' ||
    (parsedInput?.type === 'custom_url' && input.includes('youtube.com'));

  const selectSearchResult = (channel: YouTubeChannel) => {
    setChannelInfo(channel);
    setParsedInput({
      type: 'channel_id',
      value: channel.id,
      originalInput: channel.title,
    });
    setValidationError('');
  };

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
            className="fixed inset-0 z-[100] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-xl bg-white dark:bg-gray-900 md:rounded-2xl shadow-2xl flex flex-col h-[100dvh] md:h-auto md:max-h-[85vh] overflow-hidden border border-gray-200 dark:border-gray-800"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
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

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
              <form onSubmit={handleSubmit} className="space-y-6">
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
                      type="text"
                      id="channelInput"
                      value={input}
                      onChange={handleInputChange}
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

                {/* Search Results */}
                <AnimatePresence>
                  {searchResults.length > 0 && (
                    <motion.section
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3"
                    >
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Search className="w-4 h-4 text-red-600" />
                        Search Results
                      </h3>
                      <div className="max-h-64 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                        {searchResults.map((channel) => (
                          <button
                            key={channel.id}
                            type="button"
                            onClick={() => selectSearchResult(channel)}
                            className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all ${channelInfo?.id === channel.id
                              ? 'border-red-500 bg-red-50 dark:bg-red-950/20 shadow-sm'
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
                              <span className="block truncate font-medium text-gray-900 dark:text-gray-100">
                                {channel.title}
                              </span>
                              {channel.description && (
                                <span className="line-clamp-1 text-sm text-gray-500 dark:text-gray-400">
                                  {channel.description}
                                </span>
                              )}
                            </span>
                            {channelInfo?.id === channel.id && <Check className="h-5 w-5 flex-none text-red-500" />}
                          </button>
                        ))}
                      </div>
                    </motion.section>
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
                      </div>
                    </motion.section>
                  )}
                </AnimatePresence>

                {/* Supported Formats */}
                <section className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30 p-4 space-y-3">
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
                </section>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isLoading || !canSubmit}
                    className="flex items-center justify-center gap-2 flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
                        <span>Adding...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>Add Channel</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-all font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
