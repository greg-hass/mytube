import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FloatingTabBar } from './FloatingTabBar';

describe('FloatingTabBar', () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  it('renders Add as the prominent middle action', () => {
    render(
      <FloatingTabBar
        activeTab="latest"
        onTabChange={vi.fn()}
        onAddChannel={vi.fn()}
        subscriptionCount={4}
        favoriteCount={3}
      />,
    );

    const addTab = screen.getByRole('button', { name: 'Add' });
    expect(addTab).toBeInTheDocument();
    expect(addTab.className).toContain('bg-red-600');
    expect(addTab.className).toContain('rounded-full');
    const icon = addTab.querySelector('svg');
    expect(icon?.className.baseVal ?? icon?.getAttribute('class')).toMatch(
      /text-white/,
    );

    const tabLabels = within(screen.getByRole('navigation'))
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(tabLabels).toEqual(['Latest', 'Subs', 'Add', 'Activity', 'Faves']);
  });

  it('invokes onAddChannel when the Add tab is tapped', () => {
    const onAddChannel = vi.fn();
    render(
      <FloatingTabBar
        activeTab="latest"
        onTabChange={vi.fn()}
        onAddChannel={onAddChannel}
        subscriptionCount={4}
        favoriteCount={3}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAddChannel).toHaveBeenCalledTimes(1);
  });

  it('does not show a badge on the Subs tab', () => {
    render(
      <FloatingTabBar
        activeTab="latest"
        onTabChange={vi.fn()}
        onAddChannel={vi.fn()}
        subscriptionCount={4}
        favoriteCount={3}
      />,
    );

    const subsTab = screen.getByRole('button', { name: 'Subs' });
    const badge = subsTab.querySelector('.bg-red-500');
    expect(badge).not.toBeInTheDocument();
  });

  it('only shows a badge for Faves because Activity is a summary, not unread state', () => {
    render(
      <FloatingTabBar
        activeTab="latest"
        onTabChange={vi.fn()}
        onAddChannel={vi.fn()}
        subscriptionCount={4}
        favoriteCount={3}
      />,
    );

    const activityTab = screen.getByRole('button', { name: 'Activity' });
    const favesTab = screen.getByRole('button', { name: 'Faves' });

    expect(activityTab.querySelector('.bg-red-500')).not.toBeInTheDocument();
    expect(favesTab.querySelector('.bg-red-500')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Queue' })).not.toBeInTheDocument();
  });

  it('stays visible while scrolling on mobile', () => {
    render(
      <FloatingTabBar
        activeTab="latest"
        onTabChange={vi.fn()}
        onAddChannel={vi.fn()}
        subscriptionCount={4}
        favoriteCount={3}
      />,
    );

    const tabBar = screen.getByTestId('floating-tab-bar');
    expect(tabBar).toHaveAttribute('data-hidden', 'false');

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 120 });
    fireEvent.scroll(window);
    expect(tabBar).toHaveAttribute('data-hidden', 'false');

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 64 });
    fireEvent.scroll(window);
    expect(tabBar).toHaveAttribute('data-hidden', 'false');

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    fireEvent.scroll(window);
    expect(tabBar).toHaveAttribute('data-hidden', 'false');
  });

  it('stays visible on desktop viewports', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });

    render(
      <FloatingTabBar
        activeTab="latest"
        onTabChange={vi.fn()}
        onAddChannel={vi.fn()}
        subscriptionCount={4}
        favoriteCount={3}
      />,
    );

    const tabBar = screen.getByTestId('floating-tab-bar');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 120 });
    fireEvent.scroll(window);

    expect(tabBar).toHaveAttribute('data-hidden', 'false');
  });
});
