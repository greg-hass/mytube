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

  it('searches by keywords and adds the selected channel', async () => {
    const onAdd = vi.fn();

    render(<AddChannelModal isOpen onClose={vi.fn()} onAdd={onAdd} />);

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

    fireEvent.click(screen.getByText('Linux Tech Channel'));
    fireEvent.click(screen.getByRole('button', { name: /add channel/i }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
        id: 'UC1234567890123456789012',
        title: 'Linux Tech Channel',
      }));
    });
  });
});
