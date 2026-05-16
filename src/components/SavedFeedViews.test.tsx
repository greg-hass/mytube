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
