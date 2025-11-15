# YouTube Subscriptions - RSS Migration Design

**Date:** 2025-01-15
**Status:** Approved
**Approach:** Clean Slate Migration (Option 1)

## Executive Summary

Migrate from YouTube Data API v3 (with quota limits) to YouTube RSS feeds (unlimited, free). Remove OAuth completely and use OPML import for subscription management.

## Motivation

- YouTube API has 10,000 units/day quota limit
- Fetching videos consumes quota quickly
- User hit quota limit, causing "no subscriptions found" errors
- RSS feeds are free, unlimited, and don't require authentication

## High-Level Architecture

### Components Being Removed

- `src/hooks/useYouTubeAuth.ts` - OAuth authentication hook
- `src/components/Login.tsx` - Google login UI
- `src/lib/youtube-api.ts` - YouTube Data API client class
- `src/config/youtube.ts` - API keys and OAuth config
- Dependencies: `@react-oauth/google`, `gapi-script`
- Authentication state from Zustand store

### Components Being Added

- `src/lib/opml-parser.ts` - Parse OPML XML files to extract channel data
- `src/lib/rss-fetcher.ts` - Fetch and parse YouTube RSS feeds
- `src/lib/indexeddb.ts` - IndexedDB wrapper for storing subscriptions
- `src/components/OPMLUpload.tsx` - Drag-drop OPML file upload UI
- `src/hooks/useSubscriptionStorage.ts` - Hook for IndexedDB operations
- `src/hooks/useRSSVideos.ts` - Hook to fetch videos via RSS
- Dependency: `fast-xml-parser` for XML parsing

### Data Flow

1. **Import:** User drags OPML file → Parse → Extract channels → Store in IndexedDB
2. **Load:** App loads → Read channels from IndexedDB → Display subscription grid
3. **Videos:** User clicks "Latest Videos" → Fetch RSS feeds for top N channels → Parse XML → Display videos
4. **Refresh:** Every 30 mins → Auto-refresh RSS feeds → Update video list
5. **Export:** User can export → Read from IndexedDB → Generate OPML → Download file

## OPML Import System

### OPML File Structure

YouTube exports subscriptions as OPML XML:

```xml
<opml>
  <body>
    <outline text="YouTube Subscriptions" title="YouTube Subscriptions">
      <outline text="Channel Name" title="Channel Name"
               type="rss" xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id=UC..." />
    </outline>
  </body>
</opml>
```

### Parsing Strategy

- Use `fast-xml-parser` library to parse XML into JSON
- Extract all `<outline>` elements with `type="rss"`
- Parse `xmlUrl` to extract channel ID (the `channel_id=UC...` part)
- Extract channel name from `text` or `title` attribute
- Handle edge cases: missing attributes, malformed URLs, nested outlines

### IndexedDB Schema

**Store: 'subscriptions'**
```typescript
interface StoredSubscription {
  id: string;              // Channel ID (e.g., "UCxxx")
  title: string;           // Channel name
  thumbnail?: string;      // Channel avatar (fetched from RSS later)
  addedAt: number;         // Timestamp when imported
  customUrl?: string;      // Channel custom URL
  description?: string;    // Channel description
}
```

**Store: 'videos-cache'**
```typescript
interface CachedVideo {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  description: string;
  cachedAt: number;        // When we fetched this
}
```

### Upload UI

- Drag-drop zone on initial load (if no subscriptions stored)
- "Import OPML" button in header (to re-import or add more)
- Progress indicator while parsing and storing
- Success message showing count of channels imported

## RSS Feed Fetcher

### YouTube RSS Feed URLs

Each channel has a public RSS feed:
```
https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
```

Features:
- Returns latest ~15 videos per channel
- No authentication required
- No quota limits
- Updates automatically when new videos are uploaded

### CORS Challenge & Solution

YouTube RSS feeds have CORS restrictions - browsers block direct fetch.

**Solution: CORS Proxy**
```typescript
const CORS_PROXY = 'https://corsproxy.io/?';
const feedUrl = `${CORS_PROXY}${encodeURIComponent(
  `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
)}`;
```

**Alternative (better for production):** Build a tiny serverless function (Cloudflare Worker/Vercel Edge) that proxies RSS requests. Free tier is sufficient.

### RSS Feed Structure

YouTube RSS uses Atom format:
```xml
<feed>
  <entry>
    <id>yt:video:VIDEO_ID</id>
    <title>Video Title</title>
    <published>2024-01-15T10:30:00+00:00</published>
    <author><name>Channel Name</name></author>
    <media:group>
      <media:thumbnail url="https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg"/>
      <media:description>Video description</media:description>
    </media:group>
  </entry>
</feed>
```

### Fetching Strategy

- Fetch RSS feeds in parallel (max 10 concurrent to avoid rate limiting)
- Parse XML using `fast-xml-parser`
- Extract video data and transform to our `YouTubeVideo` type
- Store in IndexedDB cache with 30-minute TTL
- Auto-refresh: setInterval checks cache age, refetches if > 30 mins old

## UI Changes

### Removing

- `Login.tsx` component
- Google OAuth button from `Header.tsx`
- Authentication state checks throughout the app
- "Sign Out" functionality

### New Component: OPMLUpload.tsx

**Initial State (no subscriptions):**
- Full-screen drag-drop zone with instructions
- "How to export from YouTube" help text with link
- File input as fallback for users who can't drag-drop

**After Import:**
- Component minimizes to header button
- Shows "X subscriptions loaded" status
- "Import More" and "Export Subscriptions" buttons

### Updated Header.tsx

```
[Logo] YouTube Subscriptions    [123 channels] [Import] [Export] [Theme Toggle]
```

### Updated Dashboard.tsx

- Remove OAuth-dependent logic
- Use `useSubscriptionStorage()` hook instead of `useSubscriptions()`
- Use `useRSSVideos()` hook instead of `useLatestVideos()`
- Add loading state while RSS feeds are being fetched
- Add error handling for failed RSS fetches

### Subscription Management

- Right-click (or long-press on mobile) on subscription card → "Remove" option
- "Export Subscriptions" → Downloads current list as OPML file
- "Clear All Subscriptions" → Confirmation dialog → Wipe IndexedDB

### First-Time User Experience

1. Visit app → See OPML upload screen with instructions
2. Click "How to export" → Opens YouTube subscription manager in new tab
3. Drag OPML file → Progress bar → "Successfully imported 150 channels!"
4. Automatically navigate to subscription grid

## Error Handling & Edge Cases

### OPML Import Errors

- **Invalid file format:** Show error toast "Please upload a valid OPML file from YouTube"
- **Empty OPML:** Show warning "No subscriptions found in this file"
- **Duplicate imports:** Merge by channel ID, don't create duplicates
- **Partial failures:** If some channels fail to parse, import the rest and show count

### RSS Feed Fetch Errors

- **CORS proxy down:** Fallback to alternative proxy or show error message
- **Individual feed fails:** Skip that channel, continue with others, log error
- **All feeds fail:** Show error banner "Unable to fetch videos - please check your internet connection"
- **Network timeout:** Retry failed feeds once after 5 seconds
- **Rate limiting:** If we get 429 responses, back off exponentially

### IndexedDB Errors

- **Storage quota exceeded:** Detect and show "Storage full - please clear old data"
- **Private browsing mode:** IndexedDB may be disabled - fallback to in-memory storage with warning
- **Corruption:** Try to recover, worst case: prompt to re-import OPML

### Edge Cases

- **No subscriptions in IndexedDB on load:** Show OPML upload screen
- **Channel deleted/private:** RSS feed returns 404 - remove from list automatically
- **Channel ID changed:** Handle gracefully, may need user to re-import
- **Malformed RSS XML:** Catch parse errors, skip that feed, log for debugging
- **Stale cache (> 7 days old):** Auto-refresh on next load

### Offline Support

- Show cached videos from IndexedDB when offline
- Display "Offline" badge on stale data
- Retry refresh when connection restored

## Implementation Order

1. **Setup:** Install `fast-xml-parser`, create directory structure
2. **IndexedDB:** Build wrapper for subscriptions and video cache
3. **OPML Parser:** Parse OPML files and extract channel data
4. **RSS Fetcher:** Fetch and parse YouTube RSS feeds
5. **Storage Hooks:** Create `useSubscriptionStorage` and `useRSSVideos`
6. **Upload UI:** Build `OPMLUpload` component
7. **Update Existing:** Modify `Dashboard`, `Header`, `SubscriptionsList`
8. **Remove OAuth:** Delete authentication code and dependencies
9. **Testing:** Test with real OPML file, verify all features work
10. **Polish:** Error messages, loading states, UX improvements

## Success Criteria

- ✅ User can import OPML file without errors
- ✅ Subscriptions persist in IndexedDB across sessions
- ✅ Videos load from RSS feeds without quota errors
- ✅ Auto-refresh works every 30 minutes
- ✅ User can export subscriptions as OPML
- ✅ All OAuth code removed
- ✅ No API quota errors ever
- ✅ Offline mode works with cached data

## Migration Path for Users

1. Export OPML from YouTube before migration
2. Update app (pulls new RSS-based code)
3. Import OPML file on first load
4. Continue using app normally - no more quota issues
