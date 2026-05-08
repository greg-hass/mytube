import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionsList } from './SubscriptionsList';

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
    subscriptions: [
      { id: 'UC1', title: 'One', description: '', thumbnail: 'https://example.com/1.jpg' },
      { id: 'UC2', title: 'Two', description: '', thumbnail: 'https://example.com/2.jpg' },
    ],
    rawSubscriptions: [],
    isLoading: false,
    removeSubscription: vi.fn(),
    addSubscriptions: vi.fn(),
    toggleFavorite: vi.fn(),
    toggleMute: vi.fn(),
    repairChannelIcons: vi.fn(),
  }),
}));

vi.mock('../store/useStore', () => ({
  useStore: () => ({ viewMode: 'grid' }),
}));

vi.mock('./SubscriptionCard', () => ({
  SubscriptionCard: ({ channel }: any) => <article>{channel.title}</article>,
}));

describe('SubscriptionsList', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  it('uses page scrolling and keeps the repair toolbar on the universal app surface', () => {
    render(<SubscriptionsList />);

    const list = screen.getByTestId('subscriptions-list');
    const repairToolbar = screen.getByTestId('repair-icons-toolbar');

    expect(list.className).not.toContain('overflow-auto');
    expect(list.className).not.toContain('h-[calc');
    expect(repairToolbar.className).toContain('bg-gray-50');
    expect(repairToolbar.className).toContain('dark:bg-gray-950');
  });
});
