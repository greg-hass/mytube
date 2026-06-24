import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FloatingTabBar } from './FloatingTabBar';

describe('FloatingTabBar', () => {
  it('renders the add action as a tab with a red icon', () => {
    render(
      <FloatingTabBar
        activeTab="latest"
        onTabChange={vi.fn()}
        onAddChannel={vi.fn()}
        subscriptionCount={4}
        activeChannelCount={2}
        queueCount={1}
        favoriteCount={3}
      />,
    );

    const addTab = screen.getByRole('button', { name: 'Add' });
    expect(addTab).toBeInTheDocument();
    const icon = addTab.querySelector('svg');
    expect(icon?.className.baseVal ?? icon?.getAttribute('class')).toMatch(
      /text-red-500|text-red-400/,
    );
  });

  it('invokes onAddChannel when the Add tab is tapped', () => {
    const onAddChannel = vi.fn();
    render(
      <FloatingTabBar
        activeTab="latest"
        onTabChange={vi.fn()}
        onAddChannel={onAddChannel}
        subscriptionCount={4}
        activeChannelCount={2}
        queueCount={1}
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
        activeChannelCount={2}
        queueCount={1}
        favoriteCount={3}
      />,
    );

    const subsTab = screen.getByRole('button', { name: 'Subs' });
    const badge = subsTab.querySelector('.bg-red-500');
    expect(badge).not.toBeInTheDocument();
  });

  it('still shows badges on Activity, Queue, and Faves when counts are positive', () => {
    render(
      <FloatingTabBar
        activeTab="latest"
        onTabChange={vi.fn()}
        onAddChannel={vi.fn()}
        subscriptionCount={4}
        activeChannelCount={2}
        queueCount={1}
        favoriteCount={3}
      />,
    );

    const activityTab = screen.getByRole('button', { name: 'Activity' });
    const queueTab = screen.getByRole('button', { name: 'Queue' });
    const favesTab = screen.getByRole('button', { name: 'Faves' });

    expect(activityTab.querySelector('.bg-red-500')).toBeInTheDocument();
    expect(queueTab.querySelector('.bg-red-500')).toBeInTheDocument();
    expect(favesTab.querySelector('.bg-red-500')).toBeInTheDocument();
  });
});
