import { act, render, screen } from '@testing-library/react';
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

  it('keeps normal app UI visible if phone landscape is reported before portrait lock applies', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <MobileLandscapeGate>
          <main>Feed UI</main>
        </MobileLandscapeGate>
      </MemoryRouter>
    );

    expect(screen.getByText('UI can only be viewed in portrait mode')).toBeInTheDocument();
    expect(screen.getByText('Feed UI')).toBeInTheDocument();
    expect(screen.getByText('Feed UI').closest('.orientation-locked-shell')).toBeNull();
  });

  it('keeps the app shell portrait-locked on the video player route', () => {
    render(
      <MemoryRouter initialEntries={['/video/video-1']}>
        <MobileLandscapeGate>
          <main>Now playing</main>
        </MobileLandscapeGate>
      </MemoryRouter>
    );

    expect(screen.getByText('UI can only be viewed in portrait mode')).toBeInTheDocument();
    expect(screen.getByText('Now playing').closest('.mobile-landscape-lock-content')).toBeNull();
    expect(screen.getByText('Now playing').closest('.orientation-locked-shell')).toBeNull();
    expect(lock).toHaveBeenCalledWith('portrait');
    expect(unlock).not.toHaveBeenCalled();
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

    expect(screen.getByText('UI can only be viewed in portrait mode')).toBeInTheDocument();
    expect(screen.getByText('Feed UI')).toBeInTheDocument();
    expect(screen.getByText('Feed UI').closest('.orientation-locked-shell')).toBeNull();
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

  it('re-applies the portrait lock when normal mobile routes resize', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <MobileLandscapeGate>
          <main>Feed UI</main>
        </MobileLandscapeGate>
      </MemoryRouter>
    );

    vi.clearAllMocks();
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(lock).toHaveBeenCalledWith('portrait');
    expect(unlock).not.toHaveBeenCalled();
  });
});
