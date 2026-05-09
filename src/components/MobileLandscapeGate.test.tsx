import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileLandscapeGate } from './MobileLandscapeGate';

describe('MobileLandscapeGate', () => {
  const lock = vi.fn().mockResolvedValue(undefined);
  const unlock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 932,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 430,
    });
    Object.defineProperty(window.screen, 'orientation', {
      configurable: true,
      value: { lock, unlock },
    });
  });

  it('blocks normal app UI in phone landscape', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <MobileLandscapeGate>
          <main>Feed UI</main>
        </MobileLandscapeGate>
      </MemoryRouter>
    );

    expect(screen.getByText('Rotate back to portrait')).toBeInTheDocument();
    expect(screen.queryByText('Feed UI')).not.toBeInTheDocument();
  });

  it('allows the video player route to use phone landscape', () => {
    render(
      <MemoryRouter initialEntries={['/video/video-1']}>
        <MobileLandscapeGate>
          <main>Now playing</main>
        </MobileLandscapeGate>
      </MemoryRouter>
    );

    expect(screen.queryByText('Rotate back to portrait')).not.toBeInTheDocument();
    expect(screen.getByText('Now playing').closest('.mobile-landscape-lock-content')).toBeNull();
    expect(unlock).toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
  });

  it('allows normal app UI in phone portrait', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 844,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <MobileLandscapeGate>
          <main>Feed UI</main>
        </MobileLandscapeGate>
      </MemoryRouter>
    );

    expect(screen.queryByText('Rotate back to portrait')).not.toBeInTheDocument();
    expect(screen.getByText('Feed UI')).toBeInTheDocument();
  });

  it('asks the browser to lock normal mobile routes to portrait', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <MobileLandscapeGate>
          <main>Feed UI</main>
        </MobileLandscapeGate>
      </MemoryRouter>
    );

    expect(lock).toHaveBeenCalledWith('portrait');
  });
});
