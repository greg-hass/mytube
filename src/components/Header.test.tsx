import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

vi.mock('framer-motion', () => ({
  motion: {
    header: ({ animate, children, initial, ...props }: any) => {
      void animate;
      void initial;
      return <header {...props}>{children}</header>;
    },
    div: ({ children, whileHover, ...props }: any) => {
      void whileHover;
      return <div {...props}>{children}</div>;
    },
    button: ({ children, whileHover, whileTap, ...props }: any) => {
      void whileHover;
      void whileTap;
      return <button {...props}>{children}</button>;
    },
  },
}));

vi.mock('../store/useStore', () => ({
  useStore: () => ({
    theme: 'dark',
    toggleTheme: vi.fn(),
    viewMode: 'grid',
    setViewMode: vi.fn(),
    sortBy: 'recent',
    setSortBy: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
  }),
}));

vi.mock('../hooks/useSubscriptionStorage', () => ({
  useSubscriptionStorage: () => ({
    count: 261,
    exportOPML: vi.fn(),
    exportJSON: vi.fn(),
    importOPML: vi.fn(),
    isImporting: false,
  }),
}));

vi.mock('./SettingsModal', () => ({
  SettingsModal: () => null,
}));

vi.mock('./OPMLUpload', () => ({
  OPMLUpload: ({ minimal }: { minimal?: boolean }) => (
    <button>{minimal ? 'Import' : 'Upload'}</button>
  ),
}));

describe('Header', () => {
  it('moves mobile actions into a slide-in menu instead of permanent toolbar chrome', () => {
    render(<Header onAddChannel={vi.fn()} />);

    const menuButton = screen.getByTestId('mobile-menu-button');

    expect(menuButton).toBeInTheDocument();
    expect(screen.getByTestId('mobile-add-channel-button')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-refresh-button')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-toolbar')).not.toBeInTheDocument();
  });

  it('opens add channel from the mobile header plus button', () => {
    const onAddChannel = vi.fn();
    render(<Header onAddChannel={onAddChannel} />);

    fireEvent.click(screen.getByTestId('mobile-add-channel-button'));

    expect(onAddChannel).toHaveBeenCalledOnce();
  });

  it('renders the mobile menu overlay outside the animated header', () => {
    render(<Header onAddChannel={vi.fn()} />);

    fireEvent.click(screen.getByTestId('mobile-menu-button'));

    const menuPanel = screen.getByTestId('mobile-menu-panel');
    expect(menuPanel.closest('header')).toBeNull();
    expect(menuPanel.querySelector('aside')?.className).toContain('safe-top');
    expect(menuPanel.querySelector('aside')?.className).toContain('dark:bg-gray-950');
    expect(menuPanel.querySelector('aside')?.className).not.toContain('dark:bg-gradient');
  });

  it('can hide mobile search when the active view does not use channel search', () => {
    render(<Header onAddChannel={vi.fn()} showMobileSearch={false} />);

    expect(screen.queryAllByPlaceholderText('Search channels...')).toHaveLength(1);
  });

  it('reveals mobile search only after tapping the search icon', () => {
    render(<Header onAddChannel={vi.fn()} searchPlaceholder="Search videos..." />);

    expect(screen.queryAllByPlaceholderText('Search videos...')).toHaveLength(1);

    fireEvent.click(screen.getByTestId('mobile-search-button'));

    expect(screen.queryAllByPlaceholderText('Search videos...')).toHaveLength(2);
  });
});
