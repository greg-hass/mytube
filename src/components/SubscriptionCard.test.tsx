import { render, screen } from '@testing-library/react';
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
});
