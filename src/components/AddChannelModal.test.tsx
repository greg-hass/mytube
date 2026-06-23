import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AddChannelModal } from './AddChannelModal';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ animate, children, exit, initial, whileHover, ...props }: any) => {
      void animate;
      void exit;
      void initial;
      void whileHover;
      return <div {...props}>{children}</div>;
    },
    section: ({ animate, children, exit, initial, whileHover, ...props }: any) => {
      void animate;
      void exit;
      void initial;
      void whileHover;
      return <section {...props}>{children}</section>;
    },
  },
}));

vi.mock('../lib/youtube-api', () => ({
  fetchChannelInfoWithFallback: vi.fn(() => Promise.resolve(null)),
}));

describe('AddChannelModal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => {
      const requestUrl = String(url);
      if (requestUrl.startsWith('/api/channel-search')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: [
              {
                id: 'UC1234567890123456789012',
                title: 'Linux Tech Channel',
                description: 'Linux tutorials and reviews',
                thumbnail: 'https://example.com/channel.jpg',
              },
              {
                id: 'UC2222222222222222222222',
                title: 'Kernel Notes',
                description: 'Deep dives into operating systems',
                thumbnail: 'https://example.com/kernel.jpg',
              },
            ],
          }),
        });
      }

      return Promise.resolve({ ok: false, status: 404 });
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a preview before adding a searched channel', async () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();

    render(<AddChannelModal isOpen onClose={onClose} onAdd={onAdd} />);

    expect(screen.getByAltText('MyTube')).toBeInTheDocument();
    expect(screen.getByText('Add Channel')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('YouTube Channel'), {
      target: { value: 'the linux tech channel' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/channel-search?q=linux%20tech',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /preview linux tech channel/i }));

    expect(screen.getByText('Channel Preview')).toBeInTheDocument();
    const previewCard = screen.getByText('Channel Preview').closest('section');
    expect(previewCard).not.toBeNull();
    expect(within(previewCard as HTMLElement).getByText('Linux Tech Channel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
        id: 'UC1234567890123456789012',
        title: 'Linux Tech Channel',
      }));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('Channel Preview')).not.toBeInTheDocument();
  });

  it('filters existing subscriptions out of keyword search results', async () => {
    render(
      <AddChannelModal
        isOpen
        onClose={vi.fn()}
        onAdd={vi.fn()}
        existingSubscriptions={[
          {
            id: 'UC1234567890123456789012',
            title: 'Linux Tech Channel',
            description: '',
            thumbnail: '',
          },
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText('YouTube Channel'), {
      target: { value: 'linux tech' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/channel-search?q=linux%20tech',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    expect(screen.queryByText('Linux Tech Channel')).not.toBeInTheDocument();
  });

  it('falls back to the original natural-language query when the smart query has no matches', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => {
      const requestUrl = String(url);
      if (requestUrl === '/api/channel-search?q=best%20woodworking') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ results: [] }),
        });
      }
      if (requestUrl === '/api/channel-search?q=the%20best%20woodworking%20channels') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: [
              {
                id: 'UC3333333333333333333333',
                title: 'Workshop Companion',
                description: 'Woodworking plans, tools, and shop projects',
                thumbnail: 'https://example.com/workshop.jpg',
                customUrl: '/@workshopcompanion',
                subscriberCount: '250000',
              },
            ],
          }),
        });
      }

      return Promise.resolve({ ok: false, status: 404 });
    }));

    render(<AddChannelModal isOpen onClose={vi.fn()} onAdd={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('YouTube Channel'), {
      target: { value: 'the best woodworking channels' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    vi.useRealTimers();

    expect(await screen.findByText('Workshop Companion')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /preview workshop companion/i }));

    const previewCard = screen.getByText('Channel Preview').closest('section');
    expect(previewCard).not.toBeNull();
    expect(within(previewCard as HTMLElement).getByText('250,000 subscribers')).toBeInTheDocument();
    expect(within(previewCard as HTMLElement).getByText('/@workshopcompanion')).toBeInTheDocument();
  });
});
