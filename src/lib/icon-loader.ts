import { CORS_PROXIES, buildProxiedUrl } from './cors-proxies';

const channelThumbnailCache = new Map<string, string>();
const failedChannelThumbnailCache = new Set<string>();
const inflightThumbnailRequests = new Map<string, Promise<string | null>>();
const directThumbnailCache = new Map<string, string>();

// Enhanced rate limiting with exponential backoff
interface RateLimitState {
  lastRequestTime: number;
  failureCount: number;
  baseDelay: number;
}

const rateLimitState: RateLimitState = {
  lastRequestTime: 0,
  failureCount: 0,
  baseDelay: 1000 // 1 second base delay
};

/**
 * Enhanced rate limiting with exponential backoff to avoid 429 errors
 */
async function rateLimitRequest(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - rateLimitState.lastRequestTime;

  // Calculate delay with exponential backoff based on failures
  const currentDelay = Math.min(
    rateLimitState.baseDelay * Math.pow(2, rateLimitState.failureCount),
    30000 // Max 30 seconds
  );

  if (timeSinceLastRequest < currentDelay) {
    const waitTime = currentDelay - timeSinceLastRequest;
    // Only log significant delays to reduce console spam
    if (waitTime > 2000) {
      console.warn(`⏳ Rate limiting: waiting ${waitTime}ms (backoff level: ${rateLimitState.failureCount})`);
    }
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  rateLimitState.lastRequestTime = Date.now();
}

/**
 * Record a successful request to reset backoff
 */
function recordSuccess(): void {
  rateLimitState.failureCount = Math.max(0, rateLimitState.failureCount - 1);
}

/**
 * Record a failed request to increase backoff
 */
function recordFailure(): void {
  rateLimitState.failureCount = Math.min(rateLimitState.failureCount + 1, 5);
}

/**
 * Utility functions for handling channel icon loading with multiple fallback strategies
 */

/**
 * Extract the best thumbnail URL from a YouTube channel HTML page
 */
function extractThumbnailFromHtml(html: string): string | null {
  const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  if (ogImageMatch?.[1]) {
    let thumbnail = ogImageMatch[1].replace(/&/g, '&');

    // Convert protocol-less URLs to https
    if (thumbnail.startsWith('//')) {
      thumbnail = 'https:' + thumbnail;
    }

    // Optimize thumbnail size for maximum quality
    if (thumbnail.includes('=s')) {
      // Convert very high resolutions to maximum quality 800px
      if (thumbnail.includes('=s900-')) {
        thumbnail = thumbnail.replace(/=s\d+-c/, '=s800-c');
      } else if (thumbnail.includes('=s800-')) {
        // Keep 800px as is maximum
      } else if (thumbnail.includes('=s600-')) {
        thumbnail = thumbnail.replace(/=s\d+-c/, '=s800-c');
      } else if (thumbnail.includes('=s400-')) {
        thumbnail = thumbnail.replace(/=s\d+-c/, '=s800-c');
      } else if (thumbnail.includes('=s176-')) {
        thumbnail = thumbnail.replace(/=s\d+-c/, '=s800-c');
      }
    } else if (thumbnail.includes('googleusercontent.com')) {
      // Add maximum quality size parameter if missing
      thumbnail += '=s800-c-k-c0x00ffffff-no-rj';
    }

    return thumbnail;
  }

  const imageSrcMatch = html.match(/<link[^>]+rel="image_src"[^>]+href="([^"]+)"/i);
  if (imageSrcMatch?.[1]) {
    const thumbnail = imageSrcMatch[1].replace(/&/g, '&');
    return thumbnail;
  }

  return null;
}

/**
 * Fetch the authoritative channel thumbnail by scraping the channel page
 * through our CORS proxies. Result is memoized to avoid repeated requests.
 */
export async function resolveChannelThumbnail(channelId: string): Promise<string | null> {
  if (channelThumbnailCache.has(channelId)) {
    return channelThumbnailCache.get(channelId)!;
  }

  if (failedChannelThumbnailCache.has(channelId)) {
    return null;
  }

  if (inflightThumbnailRequests.has(channelId)) {
    return inflightThumbnailRequests.get(channelId)!;
  }

  const request = (async () => {
    const channelUrl = `https://www.youtube.com/channel/${channelId}`;

    // Try each proxy in sequence until one works
    for (let i = 0; i < CORS_PROXIES.length; i++) {
      const proxy = CORS_PROXIES[i];

      try {
        const proxiedUrl = buildProxiedUrl(proxy, channelUrl);
        const response = await fetch(proxiedUrl, {
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();

        if (html.length < 1000) {
          // Try next proxy if HTML is too short
          continue;
        }

        const thumbnail = extractThumbnailFromHtml(html);

        if (thumbnail) {
          channelThumbnailCache.set(channelId, thumbnail);
          recordSuccess();
          return thumbnail;
        } else {
          // Try next proxy
          continue;
        }
      } catch (error) {
        recordFailure();

        // If this is not the last proxy, try the next one
        if (i < CORS_PROXIES.length - 1) {
          continue;
        }
      }
    }

    failedChannelThumbnailCache.add(channelId);
    return null;
  })();

  inflightThumbnailRequests.set(channelId, request);

  const result = await request;
  inflightThumbnailRequests.delete(channelId);

  return result;
}

/**
 * Try direct YouTube thumbnail URLs that don't require proxies
 */
async function tryDirectThumbnailUrls(channelId: string): Promise<string | null> {
  // Check cache first
  if (directThumbnailCache.has(channelId)) {
    return directThumbnailCache.get(channelId)!;
  }

  const directUrls = [
    `https://yt3.ggpht.com/a/${channelId}=s800-c-k-c0x00ffffff-no-rj-mo`,  // 800x800 - maximum quality for thumbnails
    `https://yt3.ggpht.com/a/${channelId}=s600-c-k-c0x00ffffff-no-rj-mo`,   // 600x600 - high quality fallback
    `https://i.ytimg.com/i/${channelId}/hqdefault.jpg`,  // high quality
    `https://i.ytimg.com/channel/${channelId}/hqdefault.jpg`  // high quality
  ];

  for (let i = 0; i < directUrls.length; i++) {
    const url = directUrls[i];

    try {
      await rateLimitRequest();
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('image')) {
          // Cache the successful URL
          directThumbnailCache.set(channelId, url);
          recordSuccess();
          return url;
        }
      }
    } catch (error) {
      recordFailure();
      // Silently handle individual URL failures to reduce console spam
    }
  }

  return null;
}

/**
 * List of public Invidious instances to use as fallback API
 */
const INVIDIOUS_INSTANCES = [
  'https://inv.tux.pizza',
  'https://invidious.projectsegfau.lt',
  'https://invidious.jing.rocks',
  'https://vid.puffyan.us',
  'https://invidious.drgns.space'
];

/**
 * Fetch channel thumbnail using Invidious API
 * This is more reliable than scraping YouTube via proxies
 */
async function fetchFromInvidious(channelId: string): Promise<string | null> {
  // Check cache first (shared with other methods)
  if (channelThumbnailCache.has(channelId)) {
    return channelThumbnailCache.get(channelId)!;
  }

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      await rateLimitRequest();
      const response = await fetch(`${instance}/api/v1/channels/${channelId}`, {
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) continue;

      const data = await response.json();
      // Invidious returns an array of thumbnails, we want the highest quality one
      const thumbnails = data.authorThumbnails || [];
      const bestThumbnail = thumbnails.sort((a: any, b: any) => b.width - a.width)[0];

      if (bestThumbnail?.url) {
        const url = bestThumbnail.url.startsWith('http')
          ? bestThumbnail.url
          : `${instance}${bestThumbnail.url}`; // Handle relative URLs

        channelThumbnailCache.set(channelId, url);
        recordSuccess();
        return url;
      }
    } catch (error) {
      recordFailure();
      // Continue to next instance
    }
  }
  return null;
}

/**
 * Find the first working thumbnail URL for a channel
 */
export async function findWorkingThumbnail(channelId: string): Promise<string> {
  // 1. Try Invidious API first (most reliable, JSON API)
  const invidiousThumbnail = await fetchFromInvidious(channelId);
  if (invidiousThumbnail) {
    return invidiousThumbnail;
  }

  // 2. Try direct URLs (fastest if they work, but often don't for new channels)
  const directThumbnail = await tryDirectThumbnailUrls(channelId);
  if (directThumbnail) {
    return directThumbnail;
  }

  // 3. Fallback to proxy-based scraping (slowest, brittle)
  const resolved = await resolveChannelThumbnail(channelId);

  if (resolved) {
    return resolved;
  }

  return generatePlaceholderThumbnail(channelId);
}

/**
 * Generate a placeholder thumbnail as a data URI
 */
export function generatePlaceholderThumbnail(label: string): string {
  const safeLabel = encodeURIComponent(label);
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180' viewBox='0 0 320 180'%3E%3Crect width='320' height='180' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='14' fill='%23666'%3EChannel%20${safeLabel}%3C/text%3E%3C/svg%3E`;
}

/**
 * Handle image loading with multiple fallbacks
 */
export function handleImageLoadError(
  event: React.SyntheticEvent<HTMLImageElement>,
  channelId: string,
  channelTitle: string
): void {
  const target = event.target as HTMLImageElement;

  const fallbackPlaceholder = generatePlaceholderThumbnail(channelTitle || channelId);

  // Immediately use placeholder; network attempts are handled elsewhere to avoid console spam
  target.src = fallbackPlaceholder;
}

/**
 * Preload and cache channel thumbnails
 */
export async function preloadChannelThumbnails(channelIds: string[]): Promise<Map<string, string>> {
  const thumbnailMap = new Map<string, string>();

  const promises = channelIds.map(async (channelId) => {
    const workingUrl = await findWorkingThumbnail(channelId);
    thumbnailMap.set(channelId, workingUrl);
  });

  await Promise.all(promises);
  return thumbnailMap;
}

/**
 * Clear the failed thumbnail cache to allow retrying failed channels
 */
export function clearFailedThumbnailCache(): void {
  console.log(`🧹 Clearing failed thumbnail cache (${failedChannelThumbnailCache.size} channels)`);
  failedChannelThumbnailCache.clear();
}

/**
 * Clear the thumbnail cache completely
 */
export function clearAllThumbnailCache(): void {
  console.log(`🧹 Clearing all thumbnail caches (${channelThumbnailCache.size} cached, ${failedChannelThumbnailCache.size} failed, ${directThumbnailCache.size} direct)`);
  channelThumbnailCache.clear();
  failedChannelThumbnailCache.clear();
  directThumbnailCache.clear();
  inflightThumbnailRequests.clear();
}
