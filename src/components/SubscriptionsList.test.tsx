import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionsList } from './SubscriptionsList';

let mockSubscriptions = [
  { id: 'UC1', title: 'One', description: '', thumbnail: 'https://example.com/1.jpg', group: 'Tech' },
  { id: 'UC2', title: 'Two', description: '', thumbnail: 'https://example.com/2.jpg', group: 'News' },
];
const mockSetSubscriptionGroup = vi.fn();

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
  useStore: () => ({ viewMode: 'grid' }),
}));

vi.mock('./SubscriptionCard', () => ({
  SubscriptionCard: ({ channel, onSetGroup }: any) => (
    <article>
      <span>{channel.title}</span>
      <button onClick={() => onSetGroup(channel.id, 'Tech')}>Move {channel.title} to Tech</button>
    </article>
  ),
}));

describe('SubscriptionsList', () => {
  beforeEach(() => {
    mockSetSubscriptionGroup.mockClear();
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

  it('uses the dashboard empty-state design and navigation icon when no subscriptions exist', () => {
    mockSubscriptions = [];

    render(<SubscriptionsList />);

    expect(screen.getByTestId('dashboard-empty-state')).toHaveAttribute('data-empty-icon', 'subscriptions');
    expect(screen.getByText('No subscriptions found')).toBeInTheDocument();
    expect(document.querySelector('.lucide-grid3x3')).toBeInTheDocument();
  });

  it('keeps the shared empty-state design when a selected group has no channels', () => {
    render(<SubscriptionsList selectedGroup="Empty group" groups={['Empty group']} />);

    expect(screen.getByTestId('dashboard-empty-state')).toHaveAttribute('data-empty-icon', 'subscriptions');
    expect(screen.getByText('No subscriptions found')).toBeInTheDocument();
  });
});
