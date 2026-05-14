# 9.5 Product Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make YouTube RSS Subscriptions feel trustworthy enough to recommend to strangers by adding durable data recovery, full backup/restore confidence, refresh transparency, channel health, and stronger project presentation.

**Architecture:** Keep the app single-user and JSON-backed. Harden the existing storage layer instead of rewriting to SQLite, expose server health through narrow API endpoints, and build compact React surfaces that explain refresh state without turning the app into an admin console.

**Tech Stack:** Node/Express, JSON files, React 19, TypeScript, TanStack Query, Vitest, React Testing Library, Tailwind CSS.

---

## File Structure

- Modify `server/json-store.js`: add durable atomic writes, fsync, backup discovery, JSON validation, automatic restore, and orphan temp cleanup.
- Modify `server/json-store.test.js`: cover fsync-safe writes, backup pruning, corrupt primary restore, and all-backups-corrupt failure.
- Modify `server/index.js`: call storage recovery during startup and add data export/import endpoints if server-side export is needed.
- Create `server/data-integrity.js`: small wrapper for startup validation across `db.json` and `videos.json`, returning recovery events for `/api/health`.
- Test `server/data-integrity.test.js`: verify startup recovery summaries.
- Modify `src/lib/app-backup.ts`: keep the backup schema as the canonical full-app export format, including subscriptions, watched state, favorites, queue, feed filters, and settings.
- Modify `src/components/SettingsModal.tsx`: improve export/import labels, add restore success details, and show data safety status from `/api/health`.
- Modify `src/hooks/useRSSVideos.ts`: expose richer refresh status, cache age, failed channels, and retry action.
- Create `src/components/RefreshStatusPanel.tsx`: compact operational transparency panel for last refresh, next refresh, current progress, cache age, failed channels, and retry.
- Test `src/components/RefreshStatusPanel.test.tsx`: cover idle, running, stale, and failed-channel states.
- Modify `src/components/Dashboard.tsx`: render the refresh status panel near the feed controls and improve empty states for Latest, Queue, Favorites, and Subscriptions.
- Modify `server/feed-refresh-policy.js`: add consecutive failure tracking and circuit-breaker due-date logic.
- Modify `server/feed-refresh-policy.test.js`: cover failure backoff, manual refresh bypass, and stale cache preservation.
- Modify `server/feed-aggregator.js`: persist per-channel refresh metadata including last success, last failure, error reason, consecutive failures, source, and backoff-until.
- Modify `README.md`: turn it into a product page with clear positioning, trust story, screenshots section, comparison table, and one-command Docker path.

---

## Task 1: Durable JSON Writes And Recovery

**Files:**
- Modify: `server/json-store.js`
- Modify: `server/json-store.test.js`
- Create: `server/data-integrity.js`
- Create: `server/data-integrity.test.js`
- Modify: `server/index.js`

- [ ] **Step 1: Write failing storage tests**

Add tests in `server/json-store.test.js` for these exact behaviors:

```js
it('restores the newest valid backup when the primary JSON file is corrupt', async () => {
  const file = path.join(tempDir, 'db.json');
  const backupDir = path.join(tempDir, 'backups');
  await fs.mkdir(backupDir, { recursive: true });
  await fs.writeFile(file, '{bad json');
  await fs.writeFile(path.join(backupDir, 'db.2026-05-14T10-00-00.000Z.bak.json'), JSON.stringify({ version: 1 }));
  await fs.writeFile(path.join(backupDir, 'db.2026-05-14T11-00-00.000Z.bak.json'), JSON.stringify({ version: 2 }));

  const result = await recoverJsonFile(file, { fallback: { version: 0 } });

  await expect(readJson(file)).resolves.toEqual({ version: 2 });
  expect(result).toEqual({
    file,
    status: 'restored',
    backupFile: path.join(backupDir, 'db.2026-05-14T11-00-00.000Z.bak.json'),
  });
});
```

Also add:

```js
it('fails clearly when the primary file and every backup are corrupt', async () => {
  const file = path.join(tempDir, 'db.json');
  const backupDir = path.join(tempDir, 'backups');
  await fs.mkdir(backupDir, { recursive: true });
  await fs.writeFile(file, '{bad json');
  await fs.writeFile(path.join(backupDir, 'db.2026-05-14T10-00-00.000Z.bak.json'), '{also bad');

  await expect(recoverJsonFile(file, { fallback: { version: 0 } })).rejects.toThrow(
    'No valid backup found'
  );
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
npm test -- server/json-store.test.js --run
```

Expected: fails because `recoverJsonFile` is not exported.

- [ ] **Step 3: Implement recovery and safer writes**

Update `server/json-store.js` to export:

```js
async function recoverJsonFile(file, options = {}) {
  try {
    await readJson(file, options.fallback);
    await removeOrphanTempFiles(file);
    return { file, status: 'ok', backupFile: null };
  } catch (err) {
    if (err.code === 'ENOENT' && options.fallback !== undefined) {
      await writeJson(file, options.fallback);
      return { file, status: 'initialized', backupFile: null };
    }

    const backupFile = await findNewestValidBackup(file);
    if (!backupFile) {
      throw new Error(`No valid backup found for ${file}`);
    }

    const backupData = await readJson(backupFile);
    await writeJson(file, backupData, { skipBackup: true });
    await removeOrphanTempFiles(file);
    return { file, status: 'restored', backupFile };
  }
}
```

Change `writeJson` so it writes temp data, opens the temp file handle, writes JSON, syncs the file, closes it, renames it, then opens and syncs the containing directory when supported. Preserve the existing queued write API.

- [ ] **Step 4: Add startup recovery wrapper**

Create `server/data-integrity.js`:

```js
const { recoverJsonFile } = require('./json-store');

async function recoverDataFiles(files) {
  const results = [];
  for (const fileConfig of files) {
    results.push(await recoverJsonFile(fileConfig.file, { fallback: fileConfig.fallback }));
  }
  return results;
}

module.exports = { recoverDataFiles };
```

Modify `server/index.js` `init()` to call `recoverDataFiles` before reading `db.json` or `videos.json`, store the returned events in a module-level `dataIntegrityEvents`, and include them in `/api/health`:

```js
dataIntegrity: dataIntegrityEvents,
```

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- server/json-store.test.js server/data-integrity.test.js --run
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/json-store.js server/json-store.test.js server/data-integrity.js server/data-integrity.test.js server/index.js
git commit -m "fix: recover corrupt json data from backups"
```

---

## Task 2: Full Backup/Restore Confidence In Settings

**Files:**
- Modify: `src/lib/app-backup.ts`
- Modify: `src/lib/app-backup.test.ts`
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/components/SettingsModal.test.tsx`

- [ ] **Step 1: Write failing backup tests**

Add tests in `src/lib/app-backup.test.ts`:

```ts
it('exports all user-owned app data in one backup', () => {
  const backup = createAppBackup({
    subscriptions: [{ id: 'UC1', title: 'Channel', thumbnail: 'thumb.jpg', group: 'Tech', isFavorite: true }],
    watchedVideoIds: ['video-1'],
    settings: { apiKey: 'abc' },
    localData: {
      favoriteVideoIds: ['video-2'],
      favoriteVideos: [{ id: 'video-2', title: 'Saved', description: '', thumbnail: 't.jpg', channelId: 'UC1', channelTitle: 'Channel', publishedAt: '2026-05-14T00:00:00.000Z' }],
      queuedVideoIds: ['video-3'],
      queuedVideos: [{ id: 'video-3', title: 'Queued', description: '', thumbnail: 'q.jpg', channelId: 'UC1', channelTitle: 'Channel', publishedAt: '2026-05-14T00:00:00.000Z' }],
      feedQualityFilters: { hideLiveReplays: true, durationFilter: 'under-10' },
    },
    exportedAt: '2026-05-14T12:00:00.000Z',
  });

  expect(backup.version).toBe(2);
  expect(backup.subscriptions).toHaveLength(1);
  expect(backup.watchedVideos).toEqual(['video-1']);
  expect(backup.favorites.videoIds).toEqual(['video-2']);
  expect(backup.queue.videoIds).toEqual(['video-3']);
  expect(backup.feedQualityFilters).toEqual({ hideLiveReplays: true, durationFilter: 'under-10' });
});
```

- [ ] **Step 2: Run failing/passing focused tests**

Run:

```bash
npm test -- src/lib/app-backup.test.ts src/components/SettingsModal.test.tsx --run
```

Expected: existing schema tests should pass if already complete; Settings tests should fail until UI copy/status is updated.

- [ ] **Step 3: Improve Settings backup UI**

In `src/components/SettingsModal.tsx`, make the backup section explicitly say it includes:

```tsx
Subscriptions, watched videos, favorites, queue, feed filters, groups, and settings.
```

On restore success, set:

```ts
setBackupStatus(`Backup restored: ${restored.subscriptions.length} subscriptions and ${restored.watchedVideoIds.length} watched videos`);
```

Show `/api/health` `dataIntegrity` events as a compact Data Safety row:

```tsx
{serverHealth?.dataIntegrity?.some((event) => event.status === 'restored') ? 'Recovered from backup on startup' : 'Storage healthy'}
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- src/lib/app-backup.test.ts src/components/SettingsModal.test.tsx --run
npm run build
```

Expected: tests and build pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/app-backup.ts src/lib/app-backup.test.ts src/components/SettingsModal.tsx src/components/SettingsModal.test.tsx
git commit -m "feat: clarify full app backup and restore"
```

---

## Task 3: Refresh Status Panel

**Files:**
- Create: `src/components/RefreshStatusPanel.tsx`
- Create: `src/components/RefreshStatusPanel.test.tsx`
- Modify: `src/hooks/useRSSVideos.ts`
- Modify: `src/components/Dashboard.tsx`

- [ ] **Step 1: Write failing component tests**

Create `src/components/RefreshStatusPanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RefreshStatusPanel } from './RefreshStatusPanel';

describe('RefreshStatusPanel', () => {
  it('shows last refresh, next refresh, and cache age', () => {
    render(
      <RefreshStatusPanel
        status={{
          total: 47,
          current: 47,
          isSyncing: false,
          lastUpdated: new Date('2026-05-14T12:00:00.000Z').getTime(),
          errors: 0,
          videos: 120,
          state: 'idle',
          failedChannels: [],
          scheduledRefresh: {
            enabled: true,
            intervalMs: 15 * 60 * 1000,
            lastRunAt: '2026-05-14T12:00:00.000Z',
            nextRunAt: '2026-05-14T12:15:00.000Z',
          },
        }}
        cacheStatus={{ hasCache: true, isStale: false, age: 5 * 60 * 1000, videoCount: 120 }}
        onRetryFailed={vi.fn()}
      />
    );

    expect(screen.getByText(/Last refresh/i)).toBeInTheDocument();
    expect(screen.getByText(/Next refresh/i)).toBeInTheDocument();
    expect(screen.getByText(/Cache age/i)).toBeInTheDocument();
  });

  it('shows failed channels and calls retry', () => {
    const retry = vi.fn();
    render(
      <RefreshStatusPanel
        status={{
          total: 2,
          current: 2,
          isSyncing: false,
          lastUpdated: Date.now(),
          errors: 1,
          videos: 10,
          state: 'error',
          failedChannels: [{ id: 'UC_FAIL', title: 'Broken Channel', reason: 'RSS feed failed with HTTP 404' }],
        }}
        cacheStatus={{ hasCache: true, isStale: true, age: 2 * 24 * 60 * 60 * 1000, videoCount: 10 }}
        onRetryFailed={retry}
      />
    );

    expect(screen.getByText('Broken Channel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry failed/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
npm test -- src/components/RefreshStatusPanel.test.tsx --run
```

Expected: fails because the component does not exist.

- [ ] **Step 3: Implement the panel**

Create `src/components/RefreshStatusPanel.tsx` with props:

```ts
type Props = {
  status: SyncStatus;
  cacheStatus: {
    hasCache: boolean;
    isStale: boolean;
    age: number;
    videoCount: number;
  };
  onRetryFailed: () => void;
};
```

Render a compact panel with:

- `Refreshing ${status.current}/${status.total}` when syncing.
- `Last refresh` using `status.scheduledRefresh?.lastRunAt || status.lastUpdated`.
- `Next refresh` using `status.scheduledRefresh?.nextRunAt`.
- `Cache age` using `cacheStatus.age`.
- Failed channels list limited to five entries plus a count.
- `Retry failed` button when `status.failedChannels.length > 0`.

- [ ] **Step 4: Wire into Dashboard**

In `src/components/Dashboard.tsx`, destructure `cacheStatus` from `useRSSVideos()` and render:

```tsx
<RefreshStatusPanel
  status={syncStatus}
  cacheStatus={cacheStatus}
  onRetryFailed={refetchVideos}
/>
```

Place it above the Latest video grid controls and below the main tab chrome.

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/components/RefreshStatusPanel.test.tsx src/components/Dashboard.test.tsx --run
npm run build
```

Expected: tests and build pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/RefreshStatusPanel.tsx src/components/RefreshStatusPanel.test.tsx src/hooks/useRSSVideos.ts src/components/Dashboard.tsx
git commit -m "feat: show feed refresh status"
```

---

## Task 4: Per-Channel Health And RSS Backoff

**Files:**
- Modify: `server/feed-refresh-policy.js`
- Modify: `server/feed-refresh-policy.test.js`
- Modify: `server/feed-aggregator.js`
- Modify: `src/hooks/useRSSVideos.ts`
- Modify: `src/components/RefreshStatusPanel.tsx`

- [ ] **Step 1: Write failing policy tests**

Add tests in `server/feed-refresh-policy.test.js`:

```js
it('backs off channels with repeated failures during automatic refreshes', () => {
  const now = new Date('2026-05-14T12:00:00.000Z').getTime();
  const subscriptions = [{ id: 'UC_FAIL' }, { id: 'UC_OK' }];
  const channelRefreshes = {
    UC_FAIL: {
      lastFetchedAt: '2026-05-14T11:30:00.000Z',
      consecutiveFailures: 3,
      backoffUntil: '2026-05-14T18:00:00.000Z',
    },
    UC_OK: {
      lastFetchedAt: '2026-05-14T11:30:00.000Z',
    },
  };

  expect(getChannelsDueForRefresh(subscriptions, channelRefreshes, { now }).map((channel) => channel.id)).toEqual(['UC_OK']);
});

it('manual refresh bypasses repeated failure backoff', () => {
  const subscriptions = [{ id: 'UC_FAIL' }];
  const channelRefreshes = {
    UC_FAIL: {
      consecutiveFailures: 3,
      backoffUntil: '2026-05-14T18:00:00.000Z',
    },
  };

  expect(getChannelsDueForRefresh(subscriptions, channelRefreshes, { force: true }).map((channel) => channel.id)).toEqual(['UC_FAIL']);
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
npm test -- server/feed-refresh-policy.test.js --run
```

Expected: first new test fails because backoff is not implemented.

- [ ] **Step 3: Implement backoff policy**

In `server/feed-refresh-policy.js`, add:

```js
const CHANNEL_FAILURE_BACKOFF_MS = 6 * 60 * 60 * 1000;
const CHANNEL_FAILURE_BACKOFF_THRESHOLD = 3;
```

In `getChannelsDueForRefresh`, before interval checks:

```js
const backoffUntil = channelRefreshes[sub.id]?.backoffUntil;
if (backoffUntil) {
  const backoffTime = new Date(backoffUntil).getTime();
  if (Number.isFinite(backoffTime) && now < backoffTime) return false;
}
```

In `mergeChannelRefreshes`, preserve and update:

- `lastSuccessfulFetchAt` on success.
- `lastFailedFetchAt`, `lastError`, `consecutiveFailures`, and `backoffUntil` on failure.
- Reset `consecutiveFailures` and `backoffUntil` on success.

- [ ] **Step 4: Persist richer channel health**

In `server/feed-aggregator.js`, pass both successful and failed feed results into `mergeChannelRefreshes`. Each channel entry should contain:

```js
{
  lastFetchedAt,
  lastSuccessfulFetchAt,
  lastFailedFetchAt,
  lastError,
  consecutiveFailures,
  backoffUntil,
  source: 'rss' | 'uploads-fallback' | 'cache'
}
```

- [ ] **Step 5: Surface channel health**

Extend `FailedChannelRefresh` in `src/hooks/useRSSVideos.ts`:

```ts
export interface FailedChannelRefresh {
  id: string;
  title: string;
  reason: string;
  lastSuccessfulFetchAt?: string;
  lastFailedFetchAt?: string;
  consecutiveFailures?: number;
  backoffUntil?: string;
}
```

Update `RefreshStatusPanel` to show backoff text:

```tsx
{channel.backoffUntil ? `Backoff until ${formatDateTime(channel.backoffUntil)}` : channel.reason}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm test -- server/feed-refresh-policy.test.js src/components/RefreshStatusPanel.test.tsx --run
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/feed-refresh-policy.js server/feed-refresh-policy.test.js server/feed-aggregator.js src/hooks/useRSSVideos.ts src/components/RefreshStatusPanel.tsx
git commit -m "feat: track channel refresh health"
```

---

## Task 5: Empty States And Stale Data UX

**Files:**
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/components/Dashboard.test.tsx`
- Create: `src/components/EmptyState.tsx`

- [ ] **Step 1: Write failing Dashboard tests**

Add tests in `src/components/Dashboard.test.tsx`:

```tsx
it('explains Latest is empty when subscriptions exist but feeds are still refreshing', () => {
  mockAllSubscriptions = [{ id: 'UC123', title: 'Test Channel', description: '', thumbnail: '', isFavorite: false }];
  mockRSSVideosState = {
    ...mockRSSVideosState,
    videos: [],
    isLoading: false,
    syncStatus: {
      ...mockRSSVideosState.syncStatus,
      state: 'running',
      isSyncing: true,
      total: 1,
      current: 0,
    },
  };

  render(<Dashboard />);

  expect(screen.getByText(/Your feeds are refreshing/i)).toBeInTheDocument();
});

it('explains the Queue empty state', () => {
  render(<Dashboard />);
  fireEvent.click(screen.getByRole('button', { name: /queue/i }));
  expect(screen.getByText(/Your queue is empty/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
npm test -- src/components/Dashboard.test.tsx --run
```

Expected: tests fail until empty-state copy exists.

- [ ] **Step 3: Add shared EmptyState**

Create `src/components/EmptyState.tsx`:

```tsx
type EmptyStateProps = {
  title: string;
  detail: string;
  action?: React.ReactNode;
};

export function EmptyState({ title, detail, action }: EmptyStateProps) {
  return (
    <section className="rounded-lg border border-dashed border-gray-200 dark:border-gray-800 px-6 py-10 text-center">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{detail}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}
```

- [ ] **Step 4: Use targeted empty states**

In `Dashboard.tsx`, render:

- Latest with no subscriptions: `Add subscriptions to see videos here.`
- Latest while syncing: `Your feeds are refreshing. This can take a minute after import.`
- Latest with filters hiding all videos: `No videos match these filters.`
- Queue: `Your queue is empty. Add videos with the queue button on any video.`
- Favorites: `No favorites yet. Use the heart button on videos or channels.`

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/components/Dashboard.test.tsx --run
npm run build
```

Expected: tests and build pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/EmptyState.tsx src/components/Dashboard.tsx src/components/Dashboard.test.tsx
git commit -m "feat: improve empty and stale feed states"
```

---

## Task 6: README Product Page And Screenshots Checklist

**Files:**
- Modify: `README.md`
- Create: `docs/screenshots/README.md`

- [ ] **Step 1: Update README structure**

Use this top structure:

```md
# YouTube RSS Subscriptions

YouTube's subscription feed is algorithmically curated and can hide videos. FreshRSS reads feeds but does not understand YouTube. YouTube RSS Subscriptions is a YouTube-native feed reader that tracks watched state, filters Shorts, queues videos for later, and stays RSS-first so routine refreshes do not burn YouTube API quota.

## Why This Exists

## Quick Start

## What It Does

## Screenshots

## How It Compares

## Data Safety

## Configuration

## Development
```

- [ ] **Step 2: Add comparison table**

Add:

```md
| Capability | YouTube RSS Subscriptions | FreshRSS/Miniflux | YouTube Native |
| --- | --- | --- | --- |
| Chronological subscriptions | Yes | Yes | Not reliably |
| YouTube watched state | Yes | No | Yes |
| Shorts filtering | Yes | No | Limited |
| Queue/favorites | Yes | Generic only | Algorithm-coupled |
| RSS-first/no routine API quota | Yes | Yes | No |
| Self-hosted data | Yes | Yes | No |
```

- [ ] **Step 3: Add screenshot checklist**

Create `docs/screenshots/README.md`:

```md
# Screenshot Checklist

- Hero feed view with real channel thumbnails and mixed video durations.
- Mobile swipe-to-watch interaction.
- Refresh status panel with healthy state.
- Settings data safety and backup section.
- Failed channel health state with retry.
```

- [ ] **Step 4: Verify docs**

Run:

```bash
npm test -- --run
npm run build
```

Expected: app still passes after docs changes.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/screenshots/README.md
git commit -m "docs: position app as a youtube-native rss reader"
```

---

## Execution Order

1. Task 1: Durable JSON Writes And Recovery
2. Task 2: Full Backup/Restore Confidence In Settings
3. Task 3: Refresh Status Panel
4. Task 4: Per-Channel Health And RSS Backoff
5. Task 5: Empty States And Stale Data UX
6. Task 6: README Product Page And Screenshots Checklist

This order keeps the trust foundation first. UI work should not promise safety until recovery exists.

---

## Verification Gate Before Final Merge

Run:

```bash
npm test -- --run
npm run build
```

Manual smoke:

1. Start the app.
2. Confirm Settings shows storage healthy.
3. Download backup.
4. Restore the downloaded backup.
5. Trigger refresh.
6. Confirm refresh panel updates while running.
7. Confirm failed channels show retry when mocked or reproduced.
8. Confirm Latest, Queue, and Favorites empty states are understandable.

