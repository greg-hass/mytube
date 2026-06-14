import { useState } from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import type { FeedViewPreset } from '../lib/feed-view-presets';

type SavedFeedViewsProps = {
  presets: FeedViewPreset[];
  onApply: (preset: FeedViewPreset) => void;
  onSave: (name: string) => boolean | void;
  onDelete: (presetId: string) => void;
};

export function SavedFeedViews({ presets, onApply, onSave, onDelete }: SavedFeedViewsProps) {
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [newViewName, setNewViewName] = useState('');

  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId);
  const selectValue = selectedPreset ? selectedPresetId : '';

  const handleApply = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = presets.find((candidate) => candidate.id === presetId);
    if (preset) onApply(preset);
  };

  const handleSave = () => {
    const trimmedName = newViewName.trim();
    if (!trimmedName) return;
    const didSave = onSave(trimmedName);
    if (didSave !== false) {
      setNewViewName('');
    }
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
        value={selectValue}
        onChange={(event) => handleApply(event.target.value)}
        className="h-10 max-w-[10rem] rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-red-500 dark:border-ios-800 dark:bg-ios-900 dark:text-ios-200"
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
        value={newViewName}
        onChange={(event) => setNewViewName(event.target.value)}
        placeholder="Name view"
        className="h-10 w-28 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-red-500 dark:border-ios-800 dark:bg-ios-900 dark:text-ios-200 sm:w-36"
      />

      <button
        type="button"
        aria-label="Save view"
        onClick={handleSave}
        disabled={!newViewName.trim()}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gray-800 px-3 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-ios-700 dark:hover:bg-ios-600"
      >
        <Bookmark className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Save view</span>
      </button>

      <button
        type="button"
        aria-label="Delete saved view"
        onClick={handleDelete}
        disabled={!selectedPreset}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-ios-800 dark:text-ios-200 dark:hover:bg-ios-700"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
