import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SubscriptionCard } from './SubscriptionCard';

const motionProps: Record<string, any>[] = [];

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ animate, children, initial, transition, whileHover, ...props }: any) => {
      void animate;
      void initial;
      void whileHover;
      motionProps.push({ transition });
      return <div {...props}>{children}</div>;
    },
  },
}));

describe('SubscriptionCard', () => {
  it('does not delay rendering based on the channel position', () => {
    render(
      <MemoryRouter>
        <SubscriptionCard
          index={200}
          channel={{
            id: 'UC123',
            title: 'Fast Channel',
            description: '',
            thumbnail: 'https://example.com/thumb.jpg',
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Fast Channel')).toBeInTheDocument();
    expect(motionProps[0].transition).toEqual({ duration: 0.16 });
  });

  it('lets a channel be assigned to a group without opening it', () => {
    const onSetGroup = vi.fn();

    render(
      <MemoryRouter>
        <SubscriptionCard
          index={0}
          channel={{
            id: 'UC123',
            title: 'Fast Channel',
            description: '',
            thumbnail: 'https://example.com/thumb.jpg',
            group: 'Tech',
          }}
          groups={['News', 'Tech']}
          onSetGroup={onSetGroup}
        />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Group for Fast Channel'), {
      target: { value: 'News' },
    });

    expect(onSetGroup).toHaveBeenCalledWith('UC123', 'News');
  });

  it('lets a new group be created and assigned from the card', () => {
    const onSetGroup = vi.fn();

    render(
      <MemoryRouter>
        <SubscriptionCard
          index={0}
          channel={{
            id: 'UC123',
            title: 'Fast Channel',
            description: '',
            thumbnail: 'https://example.com/thumb.jpg',
          }}
          groups={[]}
          onSetGroup={onSetGroup}
        />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('New group for Fast Channel'), {
      target: { value: 'News' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add group for Fast Channel' }));

    expect(onSetGroup).toHaveBeenCalledWith('UC123', 'News');
  });

  it('toggles favorite channels from the star button', () => {
    const onToggleFavorite = vi.fn();

    render(
      <MemoryRouter>
        <SubscriptionCard
          index={0}
          channel={{
            id: 'UC123',
            title: 'Fast Channel',
            description: '',
            thumbnail: 'https://example.com/thumb.jpg',
          }}
          onToggleFavorite={onToggleFavorite}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Fast Channel to favorite channels' }));

    expect(onToggleFavorite).toHaveBeenCalledWith('UC123');
  });
});
