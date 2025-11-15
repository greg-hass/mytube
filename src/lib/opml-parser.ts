/**
 * OPML Parser for YouTube Subscriptions
 *
 * Parses OPML XML files exported from YouTube and converts them to StoredSubscription format.
 * Handles YouTube's OPML structure with nested outline elements.
 */

import { XMLParser } from 'fast-xml-parser';
import type { StoredSubscription } from './indexeddb';

/**
 * Raw channel data extracted from OPML
 */
interface OPMLChannel {
  title: string;
  channelId: string;
  xmlUrl: string;
}

/**
 * OPML outline element structure
 */
interface OPMLOutline {
  '@_text'?: string;
  '@_title'?: string;
  '@_type'?: string;
  '@_xmlUrl'?: string;
  outline?: OPMLOutline | OPMLOutline[];
}

/**
 * Root OPML structure
 */
interface OPMLDocument {
  opml?: {
    body?: {
      outline?: OPMLOutline | OPMLOutline[];
    };
  };
}

/**
 * Extract channel ID from YouTube RSS feed URL
 *
 * @param xmlUrl - YouTube RSS feed URL (e.g., "https://www.youtube.com/feeds/videos.xml?channel_id=UCxxx")
 * @returns Channel ID or null if not found
 */
function extractChannelId(xmlUrl: string): string | null {
  try {
    const url = new URL(xmlUrl);
    const channelId = url.searchParams.get('channel_id');
    return channelId;
  } catch (error) {
    console.warn('Failed to parse XML URL:', xmlUrl, error);
    return null;
  }
}

/**
 * Recursively extract all RSS channels from OPML outline elements
 *
 * YouTube's OPML has nested structure:
 * - Top level outline: "YouTube Subscriptions" container
 * - Child outlines: Individual channel subscriptions with type="rss"
 *
 * @param outline - OPML outline element or array of elements
 * @param channels - Accumulator for found channels
 */
function extractChannelsFromOutline(
  outline: OPMLOutline | OPMLOutline[],
  channels: OPMLChannel[]
): void {
  // Handle array of outlines
  if (Array.isArray(outline)) {
    outline.forEach((item) => extractChannelsFromOutline(item, channels));
    return;
  }

  // Check if this outline is an RSS feed (actual channel)
  if (outline['@_type'] === 'rss' && outline['@_xmlUrl']) {
    const xmlUrl = outline['@_xmlUrl'];
    const channelId = extractChannelId(xmlUrl);

    if (channelId) {
      // Prefer title over text, fallback to "Unknown Channel"
      const title = outline['@_title'] || outline['@_text'] || 'Unknown Channel';

      channels.push({
        title,
        channelId,
        xmlUrl
      });
    } else {
      console.warn('Skipping outline with invalid channel URL:', xmlUrl);
    }
  }

  // Recursively process nested outlines
  if (outline.outline) {
    extractChannelsFromOutline(outline.outline, channels);
  }
}

/**
 * Parse OPML XML and extract channel data
 *
 * @param opmlXML - OPML file contents as string
 * @returns Array of channel data extracted from OPML
 * @throws Error if XML parsing fails or OPML structure is invalid
 */
export function parseOPML(opmlXML: string): OPMLChannel[] {
  if (!opmlXML || opmlXML.trim().length === 0) {
    throw new Error('OPML content is empty');
  }

  // Configure XML parser
  const parser = new XMLParser({
    ignoreAttributes: false,        // Keep attributes like xmlUrl, type, etc.
    attributeNamePrefix: '@_',      // Prefix attributes with @_
    allowBooleanAttributes: true,   // Support boolean attributes
    parseAttributeValue: false,     // Keep attribute values as strings
    trimValues: true,               // Trim whitespace from values
  });

  let parsed: OPMLDocument;
  try {
    parsed = parser.parse(opmlXML);
  } catch (error) {
    throw new Error(`Failed to parse OPML XML: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Validate OPML structure
  if (!parsed.opml) {
    throw new Error('Invalid OPML: Missing <opml> root element');
  }

  if (!parsed.opml.body) {
    throw new Error('Invalid OPML: Missing <body> element');
  }

  if (!parsed.opml.body.outline) {
    throw new Error('Invalid OPML: No <outline> elements found');
  }

  // Extract all channels from outline hierarchy
  const channels: OPMLChannel[] = [];
  extractChannelsFromOutline(parsed.opml.body.outline, channels);

  if (channels.length === 0) {
    throw new Error('No YouTube channels found in OPML file');
  }

  return channels;
}

/**
 * Convert OPML channel data to StoredSubscription format
 *
 * @param channels - Array of channel data from OPML
 * @returns Array of subscriptions ready for IndexedDB storage
 */
export function channelsToSubscriptions(channels: OPMLChannel[]): StoredSubscription[] {
  const now = Date.now();

  return channels.map((channel) => ({
    id: channel.channelId,
    title: channel.title,
    addedAt: now,
    // thumbnail, customUrl, and description will be fetched from RSS feeds later
  }));
}

/**
 * Parse OPML file and convert to StoredSubscription format (convenience function)
 *
 * @param opmlXML - OPML file contents as string
 * @returns Array of subscriptions ready for IndexedDB storage
 * @throws Error if parsing fails
 */
export function parseOPMLToSubscriptions(opmlXML: string): StoredSubscription[] {
  const channels = parseOPML(opmlXML);
  return channelsToSubscriptions(channels);
}

/**
 * Validate OPML file content before parsing
 *
 * @param content - File content to validate
 * @returns True if content appears to be valid OPML
 */
export function isValidOPMLContent(content: string): boolean {
  if (!content || content.trim().length === 0) {
    return false;
  }

  // Basic validation: check for OPML root element
  const hasOPMLTag = /<opml[\s>]/i.test(content);
  const hasBodyTag = /<body[\s>]/i.test(content);

  return hasOPMLTag && hasBodyTag;
}

/**
 * Extract statistics from OPML content without full parsing
 *
 * @param opmlXML - OPML file contents as string
 * @returns Basic stats about the OPML file
 */
export function getOPMLStats(opmlXML: string): {
  isValid: boolean;
  channelCount: number;
  error?: string;
} {
  try {
    if (!isValidOPMLContent(opmlXML)) {
      return {
        isValid: false,
        channelCount: 0,
        error: 'Invalid OPML format'
      };
    }

    const channels = parseOPML(opmlXML);
    return {
      isValid: true,
      channelCount: channels.length
    };
  } catch (error) {
    return {
      isValid: false,
      channelCount: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
