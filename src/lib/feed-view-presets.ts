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

const VALID_DURATION_FILTERS: Record<DurationFilter, true> = {
  any: true,
  'under-10': true,
  '10-30': true,
  '30-plus': true,
};

const isDurationFilter = (value: unknown): value is DurationFilter => {
  return typeof value === 'string' && Object.hasOwn(VALID_DURATION_FILTERS, value);
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
    filters: { ...filters },
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
