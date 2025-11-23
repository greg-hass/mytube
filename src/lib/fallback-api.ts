import { fetchWithProxy } from './cors-proxies';

/**
 * Resolve channel using Invidious API or Piped API (public YouTube frontends)
 * This is a robust fallback when official API and scraping fail
 */
export async function resolveWithFallbackApi(searchTerm: string): Promise<{ id: string; title: string; thumbnail?: string } | null> {
    console.log(`🛡️ Attempting Invidious/Piped fallback for ${searchTerm}`);

    // Remove @ for search
    const query = searchTerm.startsWith('@') ? searchTerm.substring(1) : searchTerm;

    // 1. Try Piped API first (often more reliable and JSON-only)
    // Piped instances: https://github.com/TeamPiped/Piped/wiki/Instances
    const pipedInstances = [
        'https://pipedapi.kavin.rocks', // Often reliable
        'https://api.piped.ot.ax',
        'https://pipedapi.system41.jio', // Added
        'https://api.piped.privacy.com.de', // Added
        'https://pipedapi.drgns.space'
    ];

    for (const instance of pipedInstances) {
        try {
            // Piped doesn't need CORS proxy usually, but we'll use it if direct fails
            // Try direct first
            let data: any;
            try {
                const response = await fetch(`${instance}/search?q=${encodeURIComponent(query)}&filter=channels`);
                if (response.ok) {
                    data = await response.json();
                } else {
                    throw new Error(`Status ${response.status}`);
                }
            } catch (directError) {
                // Direct fetch failed (likely CORS), try via proxy
                console.warn(`Piped direct fetch failed for ${instance}, trying proxy:`, directError);
                const proxiedResponse = await fetchWithProxy(`${instance}/search?q=${encodeURIComponent(query)}&filter=channels`);
                data = JSON.parse(proxiedResponse);
            }

            if (data && data.items && data.items.length > 0) {
                // Find exact match if possible
                const match = data.items.find((c: any) => c.name === query || c.name === searchTerm) || data.items[0];
                // Piped returns /channel/UC... url, extract ID
                const channelId = match.url.split('/').pop();
                console.log(`✅ Resolved via Piped (${instance}): ${channelId}`);
                return {
                    id: channelId,
                    title: match.name,
                    thumbnail: match.thumbnail
                };
            }
        } catch (e) {
            console.warn(`Piped instance ${instance} failed:`, e);
        }
    }

    // 2. Fallback to Invidious instances via Proxy
    const invidiousInstances = [
        'https://inv.tux.pizza',
        'https://vid.puffyan.us',
        'https://invidious.projectsegfau.lt',
        'https://yt.artemislena.eu',
        'https://invidious.flokinet.to', // Added
        'https://invidious.privacyredirect.com' // Added
    ];

    for (const instance of invidiousInstances) {
        try {
            const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=channel`;

            // Use proxy to bypass CORS restrictions on Invidious instances
            const responseText = await fetchWithProxy(url);

            // Validate JSON before parsing to avoid syntax errors from HTML error pages
            if (responseText.trim().startsWith('<')) {
                throw new Error('Received HTML instead of JSON (likely Cloudflare or error page)');
            }

            const data = JSON.parse(responseText);

            if (data && data.length > 0) {
                // Find exact match if possible
                const match = data.find((c: any) => c.author === query || c.author === searchTerm) || data[0];

                console.log(`✅ Resolved via Invidious (${instance}): ${match.authorId}`);
                return {
                    id: match.authorId,
                    title: match.author,
                    thumbnail: match.authorThumbnails?.[0]?.url?.startsWith('http')
                        ? match.authorThumbnails[0].url
                        : `https:${match.authorThumbnails?.[0]?.url}`
                };
            }
        } catch (e) {
            console.warn(`Invidious instance ${instance} failed:`, e);
        }
    }

    return null;
}
