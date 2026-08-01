import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
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
    expect(motionProps[0].transition).toBeUndefined();
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

  it('does not render per-card new group controls', () => {
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

    expect(screen.queryByLabelText('New group for Fast Channel')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add group for Fast Channel' })).not.toBeInTheDocument();
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

	it('keeps channel actions mobile-visible and exposes their toggle state', () => {
		const onToggleFavorite = vi.fn();
		const onToggleMute = vi.fn();
		const onRemove = vi.fn();

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
					onToggleMute={onToggleMute}
					onRemove={onRemove}
				/>
			</MemoryRouter>,
		);

		const favoriteButton = screen.getByRole('button', {
			name: 'Add Fast Channel to favorite channels',
		});
		const muteButton = screen.getByRole('button', { name: 'Mute Fast Channel' });
		const removeButton = screen.getByRole('button', {
			name: 'Unsubscribe from Fast Channel',
		});

		expect(favoriteButton).toHaveAttribute('aria-pressed', 'false');
		expect(muteButton).toHaveAttribute('aria-pressed', 'false');
		expect(favoriteButton).toHaveClass('opacity-100');
		expect(muteButton).toHaveClass('opacity-100');
		expect(removeButton).toHaveClass('opacity-100');
		expect(muteButton).toHaveAttribute('title', 'Mute channel');
	});

	it('supports selecting a channel for bulk actions', () => {
		const onToggleSelect = vi.fn();

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
					selectable
					onToggleSelect={onToggleSelect}
				/>
			</MemoryRouter>,
		);

		fireEvent.click(screen.getByRole('checkbox', { name: 'Select Fast Channel' }));

		expect(onToggleSelect).toHaveBeenCalledWith('UC123');
	});

  it('removes the channel directly through onRemove (Undo toast is the safety net)', () => {
    const onRemove = vi.fn();

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
          onRemove={onRemove}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe from Fast Channel' }));

    expect(onRemove).toHaveBeenCalledWith('UC123');
  });
});
