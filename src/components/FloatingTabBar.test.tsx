import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FloatingTabBar } from './FloatingTabBar';

describe('FloatingTabBar', () => {
  it('renders the add channel tab with the header-like glass tile treatment', () => {
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

    const addButton = screen.getByRole('button', { name: 'Add channel' });
    expect(addButton.firstElementChild?.className).toContain('rounded-xl');
    expect(addButton.firstElementChild?.className).toContain('backdrop-blur-xl');
  });
});
