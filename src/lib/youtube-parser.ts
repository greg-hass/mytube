/**
 * Utility functions for parsing and validating YouTube channel inputs
 */

export interface ParsedChannelInput {
  type: 'channel_id' | 'handle' | 'custom_url' | 'invalid';
  value: string;
  originalInput: string;
}

/**
 * Parse various YouTube channel input formats
 * Supports:
 * - Channel ID: UCxxxxxxxxxxxxxxxxxxxxxx
 * - Handle: @channelname
 * - Custom URL: youtube.com/channelname or youtube.com/c/channelname
 * - Full URLs: youtube.com/channel/UC..., youtube.com/@channelname, etc.
 */
export function parseChannelInput(input: string): ParsedChannelInput {
  const trimmedInput = input.trim();

  // Handle empty input
  if (!trimmedInput) {
    return {
      type: 'invalid',
      value: '',
      originalInput: trimmedInput,
    };
  }

  // Channel ID pattern (starts with UC followed by 22 characters)
  const channelIdPattern = /^UC[a-zA-Z0-9_-]{22}$/;
  if (channelIdPattern.test(trimmedInput)) {
    return {
      type: 'channel_id',
      value: trimmedInput,
      originalInput: trimmedInput,
    };
  }

  // Handle pattern (@username)
  const handlePattern = /^@([a-zA-Z0-9_-]+)$/;
  const handleMatch = trimmedInput.match(handlePattern);
  if (handleMatch) {
    return {
      type: 'handle',
      value: handleMatch[1],
      originalInput: trimmedInput,
    };
  }

  // URL patterns
  let url: URL;
  try {
    url = new URL(trimmedInput);
  } catch {
    // If it's not a valid URL, try treating it as a custom URL without domain
    return {
      type: 'custom_url',
      value: trimmedInput,
      originalInput: trimmedInput,
    };
  }

  // Only process YouTube URLs
  if (!url.hostname.includes('youtube.com')) {
    return {
      type: 'invalid',
      value: '',
      originalInput: trimmedInput,
    };
  }

  const path = url.pathname;

  // Extract channel ID from /channel/UCxxxxxxxxxxxxxxxxxxxxxx
  const channelMatch = path.match(/^\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (channelMatch) {
    return {
      type: 'channel_id',
      value: channelMatch[1],
      originalInput: trimmedInput,
    };
  }

  // Extract handle from /@username
  const handleUrlMatch = path.match(/^\/@([a-zA-Z0-9_-]+)/);
  if (handleUrlMatch) {
    return {
      type: 'handle',
      value: handleUrlMatch[1], // Already without @
      originalInput: trimmedInput,
    };
  }

  // Extract custom URL from /c/customname or /customname
  const customUrlMatch = path.match(/^\/(?:c\/)?([a-zA-Z0-9_-]+)/);
  if (customUrlMatch) {
    return {
      type: 'custom_url',
      value: customUrlMatch[1],
      originalInput: trimmedInput,
    };
  }

  return {
    type: 'invalid',
    value: '',
    originalInput: trimmedInput,
  };
}

/**
 * Validate if a channel input is properly formatted
 */
export function isValidChannelInput(input: string): boolean {
  const parsed = parseChannelInput(input);
  return parsed.type !== 'invalid';
}

/**
 * Convert parsed channel input to RSS feed URL
 */
export function getRSSFeedUrl(parsedInput: ParsedChannelInput): string {
  if (parsedInput.type === 'channel_id') {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${parsedInput.value}`;
  }

  // For handles and custom URLs, we need to resolve them to channel IDs first
  // This will be handled by the YouTube API fetch function
  return '';
}

/**
 * Get display text for the parsed input
 */
export function getDisplayText(parsedInput: ParsedChannelInput): string {
  switch (parsedInput.type) {
    case 'channel_id':
      return `Channel ID: ${parsedInput.value}`;
    case 'handle':
      return `@${parsedInput.value}`;
    case 'custom_url':
      return `${parsedInput.value}`;
    case 'invalid':
      return 'Invalid format';
    default:
      return parsedInput.originalInput;
  }
}