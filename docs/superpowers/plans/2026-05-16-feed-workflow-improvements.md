# Feed Workflow Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add saved feed views and stronger inbox-zero bulk actions so the Latest feed becomes a reusable daily triage workflow.

**Architecture:** Keep the feature client-side and compatible with the current single-user storage model. Store saved views in `localStorage`, reuse the existing Dashboard filter state, and keep bulk watched actions in small pure helpers so behavior is easy to test.

**Tech Stack:** React 19, TypeScript, Zustand, TanStack Query, Tailwind CSS, Vitest, React Testing Library.

---

## File Structure

- Create `src/lib/feed-view-presets.ts`: localStorage-backed saved view types, parsing, validation, create/update/delete helpers, and conversion between Dashboard filters and saved views.
- Test `src/lib/feed-view-presets.test.ts`: validates malformed storage handling, save/delete behavior, and serializing active Dashboard filters.
- Create `src/lib/feed-bulk-actions.ts`: pure helpers for selecting videos to mark watched, including visible videos and videos older than a cutoff date.
- Test `src/lib/feed-bulk-actions.test.ts`: covers visible selection, invalid dates, and older-than selection.
- Create `src/components/SavedFeedViews.tsx`: compact toolbar control for applying, saving, and deleting saved views.
- Test `src/components/SavedFeedViews.test.tsx`: covers rendering, save callback, apply callback, and delete callback.
- Modify `src/components/Dashboard.tsx`: wire saved views into the Latest toolbar and add a small bulk-action menu for "shown", "older than 7 days", and "older than 30 days".
- Modify `src/components/Dashboard.test.tsx`: cover saved view apply/save and older-than watched actions.
- Modify `src/lib/app-backup.ts`: include saved feed views in full app backup and restore.
- Modify `src/lib/app-backup.test.ts`: cover backup/restore of saved feed views.

## Task 1: Saved Feed View Storage

**Files:**
- Create: `src/lib/feed-view-presets.ts`
- Create: `src/lib/feed-view-presets.test.ts`

- [ ] **Step 1: Write failing storage tests**

Create `src/lib/feed-view-presets.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  FEED_VIEW_PRESETS_STORAGE_KEY,
  createFeedViewPreset,
  deleteFeedViewPreset,
  readFeedViewPresets,
  writeFeedViewPresets,
  type FeedViewFilters,
} from './feed-view-presets';

function createStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
  };
}

const filters: FeedViewFilters = {
  showShorts: false,
  hideWatched: true,
  durationFilter: 'under-10',
  hideLiveReplays: true,
  hidePremieres: false,
  hideDuplicateTitles: true,
  mutedKeywordText: 'spoiler, recap',
  boostedKeywordText: 'interview',
};

describe('feed view presets', () => {
  it('returns an empty list when storage is missing or malformed', () => {
    expect(readFeedViewPresets(createStorage())).toEqual([]);
    expect(readFeedViewPresets(createStorage({ [FEED_VIEW_PRESETS_STORAGE_KEY]: '{bad json' }))).toEqual([]);
    expect(readFeedViewPresets(createStorage({ [FEED_VIEW_PRESETS_STORAGE_KEY]: JSON.stringify({ nope: true }) }))).toEqual([]);
  });

  it('creates a named preset with a stable id and serialized filters', () => {
    const preset = createFeedViewPreset({
      id: 'preset-1',
      name: 'Short backlog',
      filters,
      createdAt: '2026-05-16T10:00:00.000Z',
    });

    expect(preset).toEqual({
      id: 'preset-1',
      name: 'Short backlog',
      filters,
      createdAt: '2026-05-16T10:00:00.000Z',
      updatedAt: '2026-05-16T10:00:00.000Z',
    });
  });

  it('writes presets sorted by name', () => {
    const storage = createStorage();

    writeFeedViewPresets([
      createFeedViewPreset({ id: 'b', name: 'Zed', filters, createdAt: '2026-05-16T10:00:00.000Z' }),
      createFeedViewPreset({ id: 'a', name: 'Alpha', filters, createdAt: '2026-05-16T10:00:00.000Z' }),
    ], storage);

    const saved = JSON.parse(storage.getItem(FEED_VIEW_PRESETS_STORAGE_KEY) || '[]');
    expect(saved.map((preset: { name: string }) => preset.name)).toEqual(['Alpha', 'Zed']);
  });

  it('deletes a preset by id', () => {
    const storage = createStorage({
      [FEED_VIEW_PRESETS_STORAGE_KEY]: JSON.stringify([
        createFeedViewPreset({ id: 'keep', name: 'Keep', filters, createdAt: '2026-05-16T10:00:00.000Z' }),
        createFeedViewPreset({ id: 'drop', name: 'Drop', filters, createdAt: '2026-05-16T10:00:00.000Z' }),
      ]),
    });

    const remaining = deleteFeedViewPreset('drop', storage);

    expect(remaining.map((preset) => preset.id)).toEqual(['keep']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/lib/feed-view-presets.test.ts --run
```

Expected: FAIL because `src/lib/feed-view-presets.ts` does not exist.

- [ ] **Step 3: Implement preset storage**

Create `src/lib/feed-view-presets.ts`:

```ts
import type { DurationFilter } from './video-feed-index';

export const FEED_VIEW_PRESETS_STORAGE_KEY = 'feed-view-presets';

export type FeedViewFilters = {
  showShorts: boolean;
  hideWatched: boolean;
  durationFilter: DurationFilter;
  hideLiveReplays: boolean;
  hidePremieres: boolean;
  hideDuplicateTitles: boolean;
  mutedKeywordText: string;
  boostedKeywordText: string;
};

export type FeedViewPreset = {
  id: string;
  name: string;
  filters: FeedViewFilters;
  createdAt: string;
  updatedAt: string;
};

type CreateFeedViewPresetOptions = {
  id?: string;
  name: string;
  filters: FeedViewFilters;
  createdAt?: string;
};

const isDurationFilter = (value: unknown): value is DurationFilter => {
  return value === 'any' || value === 'under-10' || value === '10-30' || value === '30-plus';
};

const isFeedViewFilters = (value: unknown): value is FeedViewFilters => {
  if (!value || typeof value !== 'object') return false;
  const filters = value as Partial<FeedViewFilters>;

  return typeof filters.showShorts === 'boolean'
    && typeof filters.hideWatched === 'boolean'
    && isDurationFilter(filters.durationFilter)
    && typeof filters.hideLiveReplays === 'boolean'
    && typeof filters.hidePremieres === 'boolean'
    && typeof filters.hideDuplicateTitles === 'boolean'
    && typeof filters.mutedKeywordText === 'string'
    && typeof filters.boostedKeywordText === 'string';
};

const isFeedViewPreset = (value: unknown): value is FeedViewPreset => {
  if (!value || typeof value !== 'object') return false;
  const preset = value as Partial<FeedViewPreset>;

  return typeof preset.id === 'string'
    && preset.id.trim().length > 0
    && typeof preset.name === 'string'
    && preset.name.trim().length > 0
    && isFeedViewFilters(preset.filters)
    && typeof preset.createdAt === 'string'
    && typeof preset.updatedAt === 'string';
};

export function readFeedViewPresets(storage: Pick<Storage, 'getItem'> = window.localStorage): FeedViewPreset[] {
  try {
    const parsed = JSON.parse(storage.getItem(FEED_VIEW_PRESETS_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFeedViewPreset).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export function writeFeedViewPresets(
  presets: FeedViewPreset[],
  storage: Pick<Storage, 'setItem'> = window.localStorage
) {
  const sortedPresets = [...presets].sort((a, b) => a.name.localeCompare(b.name));
  storage.setItem(FEED_VIEW_PRESETS_STORAGE_KEY, JSON.stringify(sortedPresets));
  return sortedPresets;
}

export function createFeedViewPreset({
  id = crypto.randomUUID(),
  name,
  filters,
  createdAt = new Date().toISOString(),
}: CreateFeedViewPresetOptions): FeedViewPreset {
  return {
    id,
    name: name.trim(),
    filters,
    createdAt,
    updatedAt: createdAt,
  };
}

export function deleteFeedViewPreset(
  presetId: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage
) {
  const remaining = readFeedViewPresets(storage).filter((preset) => preset.id !== presetId);
  return writeFeedViewPresets(remaining, storage);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/lib/feed-view-presets.test.ts --run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/feed-view-presets.ts src/lib/feed-view-presets.test.ts
git commit -m "feat: add saved feed view storage"
```

## Task 2: Feed Bulk Action Helpers

**Files:**
- Create: `src/lib/feed-bulk-actions.ts`
- Create: `src/lib/feed-bulk-actions.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/lib/feed-bulk-actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getVideoIdsOlderThan, getVisibleVideoIds } from './feed-bulk-actions';
import type { YouTubeVideo } from '../types/youtube';

const videos: YouTubeVideo[] = [
  {
    id: 'old',
    title: 'Old video',
    description: '',
    thumbnail: '',
    channelId: 'UC1',
    channelTitle: 'Channel',
    publishedAt: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 'new',
    title: 'New video',
    description: '',
    thumbnail: '',
    channelId: 'UC1',
    channelTitle: 'Channel',
    publishedAt: '2026-05-15T00:00:00.000Z',
  },
  {
    id: 'bad-date',
    title: 'Bad date video',
    description: '',
    thumbnail: '',
    channelId: 'UC1',
    channelTitle: 'Channel',
    publishedAt: 'not-a-date',
  },
];

describe('feed bulk actions', () => {
  it('returns ids for visible videos in order', () => {
    expect(getVisibleVideoIds(videos)).toEqual(['old', 'new', 'bad-date']);
  });

  it('returns ids older than a day threshold', () => {
    expect(getVideoIdsOlderThan(videos, {
      now: Date.parse('2026-05-16T00:00:00.000Z'),
      days: 7,
    })).toEqual(['old']);
  });

  it('ignores videos with invalid published dates', () => {
    expect(getVideoIdsOlderThan(videos, {
      now: Date.parse('2026-05-16T00:00:00.000Z'),
      days: 0,
    })).toEqual(['old', 'new']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/lib/feed-bulk-actions.test.ts --run
```

Expected: FAIL because `src/lib/feed-bulk-actions.ts` does not exist.

- [ ] **Step 3: Implement helper functions**

Create `src/lib/feed-bulk-actions.ts`:

```ts
import type { YouTubeVideo } from '../types/youtube';

type OlderThanOptions = {
  now?: number;
  days: number;
};

export function getVisibleVideoIds(videos: YouTubeVideo[]) {
  return videos.map((video) => video.id);
}

export function getVideoIdsOlderThan(videos: YouTubeVideo[], { now = Date.now(), days }: OlderThanOptions) {
  const cutoff = now - (days * 24 * 60 * 60 * 1000);

  return videos
    .filter((video) => {
      const publishedAt = new Date(video.publishedAt).getTime();
      return Number.isFinite(publishedAt) && publishedAt < cutoff;
    })
    .map((video) => video.id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/lib/feed-bulk-actions.test.ts --run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/feed-bulk-actions.ts src/lib/feed-bulk-actions.test.ts
git commit -m "feat: add feed bulk action helpers"
```

## Task 3: Saved Feed Views Component

**Files:**
- Create: `src/components/SavedFeedViews.tsx`
- Create: `src/components/SavedFeedViews.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `src/components/SavedFeedViews.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SavedFeedViews } from './SavedFeedViews';
import type { FeedViewPreset } from '../lib/feed-view-presets';

const preset: FeedViewPreset = {
  id: 'preset-1',
  name: 'Longform',
  createdAt: '2026-05-16T10:00:00.000Z',
  updatedAt: '2026-05-16T10:00:00.000Z',
  filters: {
    showShorts: false,
    hideWatched: true,
    durationFilter: '30-plus',
    hideLiveReplays: false,
    hidePremieres: false,
    hideDuplicateTitles: false,
    mutedKeywordText: '',
    boostedKeywordText: '',
  },
};

describe('SavedFeedViews', () => {
  it('applies a selected saved view', () => {
    const onApply = vi.fn();

    render(
      <SavedFeedViews
        presets={[preset]}
        onApply={onApply}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Saved view'), { target: { value: 'preset-1' } });

    expect(onApply).toHaveBeenCalledWith(preset);
  });

  it('saves the current filter set under a name', () => {
    const onSave = vi.fn();

    render(
      <SavedFeedViews
        presets={[]}
        onApply={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('New saved view name'), { target: { value: 'Weekend' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save view' }));

    expect(onSave).toHaveBeenCalledWith('Weekend');
  });

  it('deletes the selected saved view', () => {
    const onDelete = vi.fn();

    render(
      <SavedFeedViews
        presets={[preset]}
        onApply={vi.fn()}
        onSave={vi.fn()}
        onDelete={onDelete}
      />
    );

    fireEvent.change(screen.getByLabelText('Saved view'), { target: { value: 'preset-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved view' }));

    expect(onDelete).toHaveBeenCalledWith('preset-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/components/SavedFeedViews.test.tsx --run
```

Expected: FAIL because `src/components/SavedFeedViews.tsx` does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/SavedFeedViews.tsx`:

```tsx
import { useState } from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import type { FeedViewPreset } from '../lib/feed-view-presets';

type SavedFeedViewsProps = {
  presets: FeedViewPreset[];
  onApply: (preset: FeedViewPreset) => void;
  onSave: (name: string) => void;
  onDelete: (presetId: string) => void;
};

export function SavedFeedViews({ presets, onApply, onSave, onDelete }: SavedFeedViewsProps) {
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [newViewName, setNewViewName] = useState('');

  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId);

  const handleApply = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = presets.find((candidate) => candidate.id === presetId);
    if (preset) onApply(preset);
  };

  const handleSave = () => {
    const trimmedName = newViewName.trim();
    if (!trimmedName) return;
    onSave(trimmedName);
    setNewViewName('');
  };

  const handleDelete = () => {
    if (!selectedPreset) return;
    onDelete(selectedPreset.id);
    setSelectedPresetId('');
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <label htmlFor="saved-feed-view" className="sr-only">Saved view</label>
      <select
        id="saved-feed-view"
        aria-label="Saved view"
        value={selectedPresetId}
        onChange={(event) => handleApply(event.target.value)}
        className="h-10 max-w-[10rem] rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-red-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
      >
        <option value="">Saved views</option>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>

      <label htmlFor="new-saved-feed-view" className="sr-only">New saved view name</label>
      <input
        id="new-saved-feed-view"
        aria-label="New saved view name"
        value={newViewName}
        onChange={(event) => setNewViewName(event.target.value)}
        placeholder="Name view"
        className="h-10 w-28 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-red-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 sm:w-36"
      />

      <button
        type="button"
        onClick={handleSave}
        disabled={!newViewName.trim()}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gray-800 px-3 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600"
      >
        <Bookmark className="h-4 w-4" />
        <span className="hidden sm:inline">Save view</span>
      </button>

      <button
        type="button"
        aria-label="Delete saved view"
        onClick={handleDelete}
        disabled={!selectedPreset}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/components/SavedFeedViews.test.tsx --run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SavedFeedViews.tsx src/components/SavedFeedViews.test.tsx
git commit -m "feat: add saved feed views control"
```

## Task 4: Wire Saved Views And Bulk Actions Into Dashboard

**Files:**
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/components/Dashboard.test.tsx`

- [ ] **Step 1: Add failing Dashboard tests**

Append these tests to `src/components/Dashboard.test.tsx`:

```tsx
it('saves and applies feed view presets from the latest toolbar', async () => {
  mockRSSVideosState = {
    ...mockRSSVideosState,
    videos: [{
      id: 'video-1',
      title: 'Long update',
      description: '',
      thumbnail: '',
      channelId: 'UC123',
      channelTitle: 'Test Channel',
      publishedAt: new Date().toISOString(),
      duration: 60 * 40,
    }],
  };

  render(<Dashboard />);

  fireEvent.change(screen.getByLabelText('New saved view name'), { target: { value: 'Longform' } });
  fireEvent.click(screen.getByRole('button', { name: /save view/i }));

  await waitFor(() => {
    expect(screen.getByRole('option', { name: 'Longform' })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByLabelText('Hide Shorts'));
  fireEvent.change(screen.getByLabelText('Saved view'), { target: { value: JSON.parse(localStorage.getItem('feed-view-presets') || '[]')[0].id } });

  expect(screen.getByLabelText('Hide Shorts')).not.toBeChecked();
});

it('marks filtered videos older than 7 days as watched', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-05-16T00:00:00.000Z'));
  mockRSSVideosState = {
    ...mockRSSVideosState,
    videos: [
      {
        id: 'old-video',
        title: 'Old video',
        description: '',
        thumbnail: '',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'new-video',
        title: 'New video',
        description: '',
        thumbnail: '',
        channelId: 'UC123',
        channelTitle: 'Test Channel',
        publishedAt: '2026-05-15T00:00:00.000Z',
      },
    ],
  };

  render(<Dashboard />);

  fireEvent.change(screen.getByLabelText('Bulk watched action'), { target: { value: 'older-7' } });

  expect(mockMarkAsWatched).toHaveBeenCalledWith('old-video');
  expect(mockMarkAsWatched).not.toHaveBeenCalledWith('new-video');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/components/Dashboard.test.tsx --run
```

Expected: FAIL because the new saved view and bulk watched controls are not wired.

- [ ] **Step 3: Modify Dashboard imports**

In `src/components/Dashboard.tsx`, add imports:

```ts
import { SavedFeedViews } from './SavedFeedViews';
import { createFeedViewPreset, readFeedViewPresets, writeFeedViewPresets, type FeedViewFilters, type FeedViewPreset } from '../lib/feed-view-presets';
import { getVideoIdsOlderThan, getVisibleVideoIds } from '../lib/feed-bulk-actions';
```

- [ ] **Step 4: Add Dashboard state and handlers**

Inside `Dashboard`, add state near the existing filter state:

```ts
const [feedViewPresets, setFeedViewPresets] = useState<FeedViewPreset[]>(() => readFeedViewPresets());
```

Add helpers near `clearQualityFilters`:

```ts
const getCurrentFeedViewFilters = (): FeedViewFilters => ({
  showShorts,
  hideWatched,
  durationFilter,
  hideLiveReplays,
  hidePremieres,
  hideDuplicateTitles,
  mutedKeywordText,
  boostedKeywordText,
});

const applyFeedViewPreset = (preset: FeedViewPreset) => {
  setShowShorts(preset.filters.showShorts);
  setHideWatched(preset.filters.hideWatched);
  setDurationFilter(preset.filters.durationFilter);
  setHideLiveReplays(preset.filters.hideLiveReplays);
  setHidePremieres(preset.filters.hidePremieres);
  setHideDuplicateTitles(preset.filters.hideDuplicateTitles);
  setMutedKeywordText(preset.filters.mutedKeywordText);
  setBoostedKeywordText(preset.filters.boostedKeywordText);
  toast.success(`Applied ${preset.name}`);
};

const saveCurrentFeedViewPreset = (name: string) => {
  const preset = createFeedViewPreset({
    name,
    filters: getCurrentFeedViewFilters(),
  });
  const updatedPresets = writeFeedViewPresets([...feedViewPresets, preset]);
  setFeedViewPresets(updatedPresets);
  toast.success(`Saved ${preset.name}`);
};

const deleteSavedFeedViewPreset = (presetId: string) => {
  const preset = feedViewPresets.find((candidate) => candidate.id === presetId);
  const updatedPresets = writeFeedViewPresets(feedViewPresets.filter((candidate) => candidate.id !== presetId));
  setFeedViewPresets(updatedPresets);
  if (preset) toast.success(`Deleted ${preset.name}`);
};

const markVideosWatched = (videoIds: string[]) => {
  videoIds.forEach((videoId) => markAsWatched(videoId));
  toast.success(`Marked ${videoIds.length} video${videoIds.length === 1 ? '' : 's'} watched`);
};

const handleBulkWatchedAction = (action: string) => {
  if (action === 'shown') {
    markVideosWatched(getVisibleVideoIds(visibleLatestVideos));
    return;
  }

  if (action === 'older-7') {
    markVideosWatched(getVideoIdsOlderThan(filteredVideos, { days: 7 }));
    return;
  }

  if (action === 'older-30') {
    markVideosWatched(getVideoIdsOlderThan(filteredVideos, { days: 30 }));
  }
};
```

- [ ] **Step 5: Replace the existing mark-shown button with saved views and a bulk select**

In the `activeTab === 'latest'` toolbar, render `SavedFeedViews` before the feed filters button:

```tsx
<SavedFeedViews
  presets={feedViewPresets}
  onApply={applyFeedViewPreset}
  onSave={saveCurrentFeedViewPreset}
  onDelete={deleteSavedFeedViewPreset}
/>
```

Replace the existing `Mark shown watched` button with this select:

```tsx
{visibleLatestVideos.length > 0 && (
  <>
    <label htmlFor="bulk-watched-action" className="sr-only">Bulk watched action</label>
    <select
      id="bulk-watched-action"
      aria-label="Bulk watched action"
      defaultValue=""
      onChange={(event) => {
        handleBulkWatchedAction(event.target.value);
        event.target.value = '';
      }}
      className="hidden h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-red-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 sm:block"
    >
      <option value="" disabled>Mark watched</option>
      <option value="shown">Shown videos</option>
      <option value="older-7">Older than 7 days</option>
      <option value="older-30">Older than 30 days</option>
    </select>
  </>
)}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- src/lib/feed-view-presets.test.ts src/lib/feed-bulk-actions.test.ts src/components/SavedFeedViews.test.tsx src/components/Dashboard.test.tsx --run
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/Dashboard.tsx src/components/Dashboard.test.tsx
git commit -m "feat: add saved feed views and bulk watched actions"
```

## Task 5: Include Saved Views In App Backup

**Files:**
- Modify: `src/lib/app-backup.ts`
- Modify: `src/lib/app-backup.test.ts`

- [ ] **Step 1: Add failing backup tests**

Add this test to `src/lib/app-backup.test.ts`:

```ts
it('exports and restores saved feed views', () => {
  const storage = new Map<string, string>();
  const fakeStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  };
  const dispatchEvent = vi.fn();

  storage.set('feed-view-presets', JSON.stringify([
    {
      id: 'preset-1',
      name: 'Longform',
      filters: {
        showShorts: false,
        hideWatched: true,
        durationFilter: '30-plus',
        hideLiveReplays: false,
        hidePremieres: false,
        hideDuplicateTitles: false,
        mutedKeywordText: '',
        boostedKeywordText: '',
      },
      createdAt: '2026-05-16T10:00:00.000Z',
      updatedAt: '2026-05-16T10:00:00.000Z',
    },
  ]));

  const backup = createAppBackup({
    subscriptions: [],
    watchedVideoIds: [],
    settings: {},
    localData: readBackupLocalData(fakeStorage),
    exportedAt: '2026-05-16T10:30:00.000Z',
  });

  expect(backup.feedViewPresets).toHaveLength(1);

  restoreAppBackup(JSON.stringify(backup), { storage: fakeStorage, dispatchEvent });

  expect(JSON.parse(storage.get('feed-view-presets') || '[]')).toEqual(backup.feedViewPresets);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/lib/app-backup.test.ts --run
```

Expected: FAIL because `feedViewPresets` is not included in the backup schema.

- [ ] **Step 3: Update backup schema and storage**

In `src/lib/app-backup.ts`, add:

```ts
const FEED_VIEW_PRESETS_STORAGE_KEY = 'feed-view-presets';
```

Extend `AppBackupLocalData`:

```ts
feedViewPresets?: unknown[];
```

Extend `AppBackup`:

```ts
feedViewPresets: unknown[];
```

In `readBackupLocalData`, add:

```ts
feedViewPresets: parseJsonArray(storage.getItem(FEED_VIEW_PRESETS_STORAGE_KEY)),
```

In `createAppBackup`, add:

```ts
feedViewPresets: localData.feedViewPresets || [],
```

In `restoreAppBackup`, add:

```ts
storage.setItem(FEED_VIEW_PRESETS_STORAGE_KEY, JSON.stringify(backup.feedViewPresets || []));
```

- [ ] **Step 4: Run backup tests**

Run:

```bash
npm test -- src/lib/app-backup.test.ts --run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/app-backup.ts src/lib/app-backup.test.ts
git commit -m "feat: include saved feed views in backups"
```

## Task 6: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run all frontend tests**

Run:

```bash
npm test -- --run
```

Expected: PASS.

- [ ] **Step 2: Run type-check and build**

Run:

```bash
npm run type-check
npm run build
```

Expected: both commands complete successfully.

- [ ] **Step 3: Manual browser smoke test**

Run:

```bash
npm run dev
```

Open `http://localhost:5173` and verify:

- The Latest toolbar shows saved view controls on desktop.
- Saving a view creates a new option in the saved view dropdown.
- Applying a saved view changes `Hide Shorts`, `Hide watched`, and quality filter state.
- Bulk watched action `Shown videos` marks currently visible videos watched.
- Bulk watched action `Older than 7 days` does not mark newer videos watched.
- Existing refresh, queue, favorites, and subscription tabs still render.

- [ ] **Step 4: Commit verification fixes if needed**

If verification required fixes:

```bash
git add src/lib/feed-view-presets.ts src/lib/feed-bulk-actions.ts src/components/SavedFeedViews.tsx src/components/Dashboard.tsx src/lib/app-backup.ts src/**/*.test.ts*
git commit -m "fix: stabilize feed workflow improvements"
```

If no fixes were needed, do not create an empty commit.
