import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionsList } from './SubscriptionsList';

let mockSubscriptions = [
  { id: 'UC1', title: 'One', description: '', thumbnail: 'https://example.com/1.jpg', group: 'Tech' },
  { id: 'UC2', title: 'Two', description: '', thumbnail: 'https://example.com/2.jpg', group: 'News' },
];
const mockSetSubscriptionGroup = vi.fn();
const mockClearGroup = vi.fn();

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ animate, children, initial, transition, ...props }: any) => {
      void animate;
      void initial;
      void transition;
      return <div {...props}>{children}</div>;
    },
  },
}));

vi.mock('../hooks/useSubscriptionStorage', () => ({
  useSubscriptionStorage: () => ({
    subscriptions: mockSubscriptions,
    rawSubscriptions: [],
    isLoading: false,
    removeSubscription: vi.fn(),
    addSubscriptions: vi.fn(),
    toggleFavorite: vi.fn(),
    toggleMute: vi.fn(),
    setSubscriptionGroup: mockSetSubscriptionGroup,
    repairChannelIcons: vi.fn(),
  }),
}));

vi.mock('../store/useStore', () => ({
  useStore: () => ({ viewMode: 'grid', staleChannelDays: 90 }),
}));

vi.mock('./SubscriptionCard', () => ({
  SubscriptionCard: ({ channel, lastUploadAt, onSetGroup, selectable, selected, onToggleSelect }: any) => (
    <article>
      <span>{channel.title}</span>
      {lastUploadAt && <span>Last upload {new Date(lastUploadAt).toISOString().slice(0, 10)}</span>}
      {selectable && onToggleSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(channel.id)}
          aria-label={`Select ${channel.title}`}
        />
      )}
      <button onClick={() => onSetGroup(channel.id, 'Tech')}>Move {channel.title} to Tech</button>
    </article>
  ),
}));

describe('SubscriptionsList', () => {
  beforeEach(() => {
    mockSetSubscriptionGroup.mockClear();
    mockClearGroup.mockClear();
    mockSubscriptions = [
      { id: 'UC1', title: 'One', description: '', thumbnail: 'https://example.com/1.jpg', group: 'Tech' },
      { id: 'UC2', title: 'Two', description: '', thumbnail: 'https://example.com/2.jpg', group: 'News' },
    ];

    class ResizeObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  it('uses page scrolling without owning sticky app chrome', () => {
    render(<SubscriptionsList />);

    const list = screen.getByTestId('subscriptions-list');

    expect(list.className).not.toContain('overflow-auto');
    expect(list.className).not.toContain('h-[calc');
    expect(screen.queryByTestId('repair-icons-toolbar')).not.toBeInTheDocument();
  });

  it('filters subscriptions by selected channel group from the dashboard chrome', () => {
    render(<SubscriptionsList selectedGroup="Tech" groups={['News', 'Tech']} />);

    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.queryByText('Two')).not.toBeInTheDocument();
  });

  it('can assign a channel to a group from the subscription card', () => {
    render(<SubscriptionsList />);

    fireEvent.click(screen.getByRole('button', { name: 'Move Two to Tech' }));

    expect(mockSetSubscriptionGroup).toHaveBeenCalledWith('UC2', 'Tech');
  });

  it('passes selection controls to subscription cards', () => {
    const onToggleSelect = vi.fn();

    render(
      <SubscriptionsList
        selectable
        selectedChannelIds={new Set(['UC1'])}
        onToggleSelect={onToggleSelect}
      />,
    );

    expect(screen.getByLabelText('Select One')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Select Two'));

    expect(onToggleSelect).toHaveBeenCalledWith('UC2');
  });

  it('uses the dashboard empty-state design and navigation icon when no subscriptions exist', () => {
    mockSubscriptions = [];

    render(<SubscriptionsList />);

    expect(screen.getByTestId('dashboard-empty-state')).toHaveAttribute('data-empty-icon', 'subscriptions');
    expect(screen.getByText('No subscriptions found')).toBeInTheDocument();
    expect(document.querySelector('.lucide-grid3x3')).toBeInTheDocument();
  });

  it('keeps the shared empty-state design when a selected group has no channels', () => {
    render(
      <SubscriptionsList
        selectedGroup="Empty group"
        groups={['Empty group']}
        onClearGroup={mockClearGroup}
      />,
    );

    expect(screen.getByTestId('dashboard-empty-state')).toHaveAttribute('data-empty-icon', 'subscriptions');
    expect(screen.getByText('No subscriptions in Empty group')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all subscriptions' }));
    expect(mockClearGroup).toHaveBeenCalledOnce();
  });

  it('shows only dormant channels, stalest first, when the stale view is on', () => {
    const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const midDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const freshDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastUploadByChannel = new Map([
      ['UC1', staleDate.toISOString()],
      ['UC2', freshDate.toISOString()],
      ['UC3', midDate.toISOString()],
    ]);
    mockSubscriptions = [
      ...mockSubscriptions,
      { id: 'UC3', title: 'Three', description: '', thumbnail: 'https://example.com/3.jpg', group: 'Tech' },
    ];

    render(
      <SubscriptionsList staleOnly lastUploadByChannel={lastUploadByChannel} />,
    );

    // UC2 is fresh; UC1 (200d) sorts before UC3 (100d).
    const titles = screen.getAllByText(/^(One|Two|Three)$/).map(
      (node) => node.textContent,
    );
    expect(titles).toEqual(['One', 'Three']);
    expect(screen.queryByText('Two')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Last upload/)).toHaveLength(2);
  });

  it('explains when no channel is dormant and counts unknown channels', () => {
    const freshDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastUploadByChannel = new Map([
      ['UC1', freshDate.toISOString()],
      ['UC2', freshDate.toISOString()],
    ]);

    render(
      <SubscriptionsList staleOnly lastUploadByChannel={lastUploadByChannel} />,
    );

    expect(screen.getByText('No stale channels')).toBeInTheDocument();
    expect(
      screen.getByText(/dormant for 90\+ days/),
    ).toBeInTheDocument();
  });
});
