import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Check, AlertCircle, Search } from 'lucide-react';
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
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onClose();
            }
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Add YouTube Channel
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="channelInput" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  YouTube Channel
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="channelInput"
                    value={input}
                    onChange={handleInputChange}
                    placeholder="Search keywords, @handle, channel ID, or URL"
                    className={`w-full px-3 py-2 pr-10 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white ${validationError
                      ? 'border-red-500'
                      : channelInfo
                        ? 'border-green-500'
                        : 'border-gray-300 dark:border-gray-600'
                      }`}
                    required
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    {isValidating || isSearching ? (
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
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
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {validationError}
                  </p>
                )}

                {parsedInput && parsedInput.type !== 'invalid' && !validationError && channelInfo && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Detected: {getDisplayText(parsedInput)}
                  </p>
                )}
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Search results
                  </p>
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {searchResults.map((channel) => (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => selectSearchResult(channel)}
                        className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${channelInfo?.id === channel.id
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/30'
                          : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600 dark:hover:bg-gray-800'
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
                            <span className="line-clamp-1 text-sm text-gray-600 dark:text-gray-400">
                              {channel.description}
                            </span>
                          )}
                        </span>
                        {channelInfo?.id === channel.id && <Check className="h-5 w-5 flex-none text-red-500" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Channel preview */}
              {channelInfo && (
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-start gap-3">
                    <img
                      src={channelInfo.thumbnail}
                      alt={channelInfo.title}
                      className="w-12 h-12 rounded-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = '';
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {channelInfo.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                        {channelInfo.description || 'No description available'}
                      </p>
                      {channelInfo.subscriberCount && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {parseInt(channelInfo.subscriberCount).toLocaleString()} subscribers
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  type="submit"
                  disabled={isLoading || !canSubmit}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>

              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  💡 <strong>Supported formats:</strong>
                </p>
                <ul className="text-sm text-blue-700 dark:text-blue-300 mt-2 space-y-1">
                  <li>• Channel ID: <code className="bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded text-xs">UCxxxxxxxxxxxxxxxxxxxxxx</code></li>
                  <li>• Handle: <code className="bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded text-xs">@channelname</code></li>
                  <li>• Custom URL: <code className="bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded text-xs">youtube.com/c/channelname</code></li>
                  <li>• Full URL: <code className="bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded text-xs">youtube.com/channel/UC...</code></li>
                </ul>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
