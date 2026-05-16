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
    expect(preset.filters).not.toBe(filters);
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

  it('throws when storage write fails', () => {
    const error = new Error('Storage quota exceeded');
    const storage = {
      setItem: vi.fn(() => {
        throw error;
      }),
    };

    expect(() => writeFeedViewPresets([
      createFeedViewPreset({ id: 'a', name: 'Alpha', filters, createdAt: '2026-05-16T10:00:00.000Z' }),
    ], storage)).toThrow(error);
    expect(storage.setItem).toHaveBeenCalledOnce();
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
    const saved = JSON.parse(storage.getItem(FEED_VIEW_PRESETS_STORAGE_KEY) || '[]');
    expect(saved.map((preset: { id: string }) => preset.id)).toEqual(['keep']);
  });
});
