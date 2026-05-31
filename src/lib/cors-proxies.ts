import externalServices from './external-services.json';

export const CORS_PROXIES = externalServices.corsProxyPrefixes;

/**
 * Build a proxied URL to bypass CORS restrictions
 */
export function buildProxiedUrl(proxy: string, targetUrl: string): string {
  return `${proxy}${encodeURIComponent(targetUrl)}`;
}

/**
 * Fetches a URL using CORS proxies with retry logic
 */
export async function fetchWithProxy(url: string): Promise<string> {
  let lastError: Error | null = null;

  // Try each proxy in sequence
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const proxy = CORS_PROXIES[i];
    try {
      const proxiedUrl = buildProxiedUrl(proxy, url);

      // Avoid setting custom headers to prevent CORS preflight failures in the browser
      const response = await fetch(proxiedUrl, {
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only log significant errors to reduce console spam
      if (i === 0 || (error instanceof Error && !error.message.includes('429'))) {
        console.warn(`❌ Proxy ${i + 1} failed for URL ${url}:`, lastError.message);
      }

      // If this is the last proxy, throw the error
      if (i === CORS_PROXIES.length - 1) {
        throw lastError;
      }

      // Add delay before trying next proxy to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw lastError || new Error('All proxies failed');
}
