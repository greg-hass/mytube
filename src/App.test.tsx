import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('sonner', () => ({
  Toaster: () => null,
}));

vi.mock('./store/useStore', () => ({
  useStore: () => ({
    theme: 'light',
    checkQuotaReset: vi.fn(),
  }),
}));

vi.mock('./hooks/useSubscriptionStorage', () => ({
  useSubscriptionStorage: () => ({
    count: 0,
    isLoading: false,
  }),
}));

vi.mock('./components/Dashboard', () => ({
  Dashboard: () => <main>Empty dashboard onboarding</main>,
}));

vi.mock('./components/ChannelViewer', () => ({
  ChannelViewer: () => <main>Channel viewer</main>,
}));

vi.mock('./components/MobileLandscapeGate', () => ({
  MobileLandscapeGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./components/OPMLUpload', () => ({
  OPMLUpload: () => <main>Standalone import gate</main>,
}));

describe('App', () => {
  it('keeps dashboard controls accessible on a fresh install with no local subscriptions', async () => {
    render(<App />);

    expect(await screen.findByText('Empty dashboard onboarding')).toBeInTheDocument();
    expect(screen.queryByText('Standalone import gate')).not.toBeInTheDocument();
  });
});
