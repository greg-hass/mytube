import { CORS_PROXIES, buildProxiedUrl } from './cors-proxies';

// Enhanced caching with TTL (time-to-live)
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class EnhancedCache<K, V> {
  private cache = new Map<string, CacheEntry<V>>();
  private defaultTTL: number;

  constructor(defaultTTL: number = 30 * 60 * 1000) { // 30 minutes default
    this.defaultTTL = defaultTTL;
  }

  set(key: K, value: V, ttl: number = this.defaultTTL): void {
    const cacheKey = String(key);
    this.cache.set(cacheKey, {
      data: value,
      timestamp: Date.now(),
      ttl
    });
  }

  get(key: K): V | null {
    const cacheKey = String(key);
    const entry = this.cache.get(cacheKey);
    
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(cacheKey);
      return null;
    }
    
    return entry.data;
  }

  has(key: K): boolean {
    return this.get(key) !== null;
  }

  delete(key: K): boolean {
    return this.cache.delete(String(key));
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Enhanced caches with TTL
const thumbnailCache = new EnhancedCache<string, string>(60 * 60 * 1000); // 1 hour
const failedThumbnailCache = new EnhancedCache<string, boolean>(10 * 60 * 1000); // 10 minutes
const directThumbnailCache = new EnhancedCache<string, string>(2 * 60 * 60 * 1000); // 2 hours
const inflightRequests = new Map<string, Promise<string | null>>();

// Enhanced rate limiting with circuit breaker pattern
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  threshold: number;
  timeout: number;
}

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailureTime: 0,
  state: 'CLOSED',
  threshold: 5, // Open after 5 consecutive failures
  timeout: 60000 // Reset after 1 minute
};

// Rate limiting state
const rateLimitState = {
  lastRequestTime: 0,
  failureCount: 0,
  baseDelay: 1000, // 1 second base delay
  maxDelay: 30000 // 30 seconds max delay
};

/**
 * Check if circuit breaker is open
 */
function isCircuitBreakerOpen(): boolean {
  const now = Date.now();
  
  if (circuitBreaker.state === 'OPEN') {
    if (now - circuitBreaker.lastFailureTime > circuitBreaker.timeout) {
      circuitBreaker.state = 'HALF_OPEN';
      return false;
    }
    return true;
  }
  
  return false;
}

/**
 * Record circuit breaker failure
 */
function recordCircuitBreakerFailure(): void {
  circuitBreaker.failures++;
  circuitBreaker.lastFailureTime = Date.now();
  
  if (circuitBreaker.failures >= circuitBreaker.threshold) {
    circuitBreaker.state = 'OPEN';
    console.warn('🔌 Circuit breaker opened due to repeated failures');
  }
}

/**
 * Record circuit breaker success
 */
function recordCircuitBreakerSuccess(): void {
  circuitBreaker.failures = 0;
  circuitBreaker.state = 'CLOSED';
}

/**
 * Enhanced rate limiting with adaptive delays
 */
async function adaptiveRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - rateLimitState.lastRequestTime;
  
  // Calculate adaptive delay based on failure rate
  const failureRatio = rateLimitState.failureCount / Math.max(1, rateLimitState.failureCount + 3);
  const adaptiveDelay = rateLimitState.baseDelay * (1 + failureRatio * 3);
  const currentDelay = Math.min(adaptiveDelay, rateLimitState.maxDelay);
  
  if (timeSinceLastRequest < currentDelay) {
    const waitTime = currentDelay - timeSinceLastRequest;
    if (waitTime > 2000) {
      console.warn(`⏳ Adaptive rate limiting: waiting ${waitTime.toFixed(0)}ms`);
    }
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  rateLimitState.lastRequestTime = Date.now();
}

/**
 * Record request success
 */
function recordSuccess(): void {
  rateLimitState.failureCount = Math.max(0, rateLimitState.failureCount - 1);
  recordCircuitBreakerSuccess();
}

/**
 * Record request failure
 */
function recordFailure(): void {
  rateLimitState.failureCount = Math.min(rateLimitState.failureCount + 1, 10);
  recordCircuitBreakerFailure();
}

/**
 * Extract thumbnail from HTML with enhanced error handling
 */
function extractThumbnailFromHtml(html: string): string | null {
  try {
    const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    if (ogImageMatch?.[1]) {
      let thumbnail = ogImageMatch[1].replace(/&/g, '&');
      
      // Convert protocol-less URLs to https
      if (thumbnail.startsWith('//')) {
        thumbnail = 'https:' + thumbnail;
      }
      
      // Optimize thumbnail size
      if (thumbnail.includes('googleusercontent.com')) {
        if (thumbnail.includes('=s')) {
          // Ensure we're using a reasonable size
          thumbnail = thumbnail.replace(/=s\d+(-c)?/, '=s800-c');
        } else {
          thumbnail += '=s800-c-k-c0x00ffffff-no-rj';
        }
      }
      
      return thumbnail;
    }

    const imageSrcMatch = html.match(/<link[^>]+rel="image_src"[^>]+href="([^"]+)"/i);
    if (imageSrcMatch?.[1]) {
      return imageSrcMatch[1].replace(/&/g, '&');
    }

    return null;
  } catch (error) {
    console.warn('Error extracting thumbnail from HTML:', error);
    return null;
  }
}

/**
 * Enhanced thumbnail resolution with caching and circuit breaker
 */
export async function resolveChannelThumbnailEnhanced(channelId: string): Promise<string | null> {
  // Check cache first
  const cached = thumbnailCache.get(channelId);
  if (cached) {
    return cached;
  }

  // Check failed cache
  if (failedThumbnailCache.has(channelId)) {
    return null;
  }

  // Check inflight requests
  if (inflightRequests.has(channelId)) {
    return inflightRequests.get(channelId)!;
  }

  // Check circuit breaker
  if (isCircuitBreakerOpen()) {
    console.warn('⚠️ Circuit breaker is open, skipping thumbnail resolution');
    return null;
  }

  const request = (async () => {
    const channelUrl = `https://www.youtube.com/channel/${channelId}`;
    
    // Try each proxy with enhanced error handling
    for (let i = 0; i < CORS_PROXIES.length; i++) {
      const proxy = CORS_PROXIES[i];

      try {
        await adaptiveRateLimit();
        
        const proxiedUrl = buildProxiedUrl(proxy, channelUrl);
        const response = await fetch(proxiedUrl, {
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; YouTube-Subscriptions-App/1.0)'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        
        if (html.length < 1000) {
          continue; // Try next proxy
        }
        
        const thumbnail = extractThumbnailFromHtml(html);

        if (thumbnail) {
          thumbnailCache.set(channelId, thumbnail);
          recordSuccess();
          return thumbnail;
        }
      } catch (error) {
        recordFailure();
        
        // Only log significant errors
        if (i === 0 || !(error instanceof Error) || !error.message.includes('429')) {
          console.warn(`Thumbnail resolution failed for ${channelId} via proxy ${i + 1}:`, error instanceof Error ? error.message : error);
        }
        
        // Continue to next proxy unless this is the last one
        if (i < CORS_PROXIES.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
      }
    }

    // All proxies failed
    failedThumbnailCache.set(channelId, true);
    return null;
  })();

  inflightRequests.set(channelId, request);

  try {
    const result = await request;
    return result;
  } finally {
    inflightRequests.delete(channelId);
  }
}

/**
 * Enhanced direct thumbnail URL testing with better caching
 */
export async function tryDirectThumbnailUrlsEnhanced(channelId: string): Promise<string | null> {
  // Check cache first
  const cached = directThumbnailCache.get(channelId);
  if (cached) {
    return cached;
  }

  const directUrls = [
    `https://yt3.ggpht.com/a/${channelId}=s800-c-k-c0x00ffffff-no-rj-mo`,
    `https://yt3.ggpht.com/a/${channelId}=s600-c-k-c0x00ffffff-no-rj-mo`,
    `https://i.ytimg.com/i/${channelId}/hqdefault.jpg`,
    `https://i.ytimg.com/channel/${channelId}/hqdefault.jpg`
  ];

  for (const url of directUrls) {
    try {
      await adaptiveRateLimit();
      
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('image')) {
          directThumbnailCache.set(channelId, url);
          recordSuccess();
          return url;
        }
      }
    } catch (error) {
      recordFailure();
      // Silent failures for individual URLs
    }
  }

  return null;
}

/**
 * Enhanced thumbnail finding with fallback strategies
 */
export async function findWorkingThumbnailEnhanced(channelId: string): Promise<string> {
  // First try direct URLs
  const directThumbnail = await tryDirectThumbnailUrlsEnhanced(channelId);
  if (directThumbnail) {
    return directThumbnail;
  }

  // Then try proxy-based extraction
  const resolved = await resolveChannelThumbnailEnhanced(channelId);
  if (resolved) {
    return resolved;
  }

  return generatePlaceholderThumbnail(channelId);
}

/**
 * Generate placeholder thumbnail
 */
export function generatePlaceholderThumbnail(label: string): string {
  const safeLabel = encodeURIComponent(label);
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180' viewBox='0 0 320 180'%3E%3Crect width='320' height='180' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='14' fill='%23666'%3EChannel%20${safeLabel}%3C/text%3E%3C/svg%3E`;
}

/**
 * Cleanup expired cache entries
 */
export function cleanupThumbnailCaches(): void {
  thumbnailCache.cleanup();
  failedThumbnailCache.cleanup();
  directThumbnailCache.cleanup();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    thumbnail: thumbnailCache.size(),
    failed: failedThumbnailCache.size(),
    direct: directThumbnailCache.size(),
    inflight: inflightRequests.size,
    circuitBreaker: circuitBreaker.state,
    failureCount: rateLimitState.failureCount
  };
}

/**
 * Clear all caches
 */
export function clearAllThumbnailCaches(): void {
  thumbnailCache.clear();
  failedThumbnailCache.clear();
  directThumbnailCache.clear();
  inflightRequests.clear();
  circuitBreaker.failures = 0;
  circuitBreaker.state = 'CLOSED';
  rateLimitState.failureCount = 0;
}

/**
 * Handle image loading errors with enhanced fallbacks
 */
export function handleImageLoadErrorEnhanced(
  event: React.SyntheticEvent<HTMLImageElement>,
  channelId: string,
  channelTitle: string
): void {
  const target = event.target as HTMLImageElement;
  const fallbackPlaceholder = generatePlaceholderThumbnail(channelTitle || channelId);
  target.src = fallbackPlaceholder;
}
