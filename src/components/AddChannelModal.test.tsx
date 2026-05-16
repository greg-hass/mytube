import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AddChannelModal } from './AddChannelModal';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ animate, children, exit, initial, ...props }: any) => {
      void animate;
      void exit;
      void initial;
      return <div {...props}>{children}</div>;
    },
    section: ({ animate, children, exit, initial, ...props }: any) => {
      void animate;
      void exit;
      void initial;
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

  it('adds channels directly from search results and keeps the modal open for more additions', async () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();

    render(<AddChannelModal isOpen onClose={onClose} onAdd={onAdd} />);

    fireEvent.change(screen.getByLabelText('YouTube Channel'), {
      target: { value: 'linux tech' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText('Linux Tech Channel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /add linux tech channel/i }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
        id: 'UC1234567890123456789012',
        title: 'Linux Tech Channel',
      }));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /linux tech channel added/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /add kernel notes/i }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
        id: 'UC2222222222222222222222',
        title: 'Kernel Notes',
      }));
    });
    expect(screen.getByRole('button', { name: /kernel notes added/i })).toBeDisabled();
    expect(onAdd).toHaveBeenCalledTimes(2);
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
});
