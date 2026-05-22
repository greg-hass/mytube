import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getServerApiToken,
  installAuthenticatedFetch,
  SERVER_API_TOKEN_STORAGE_KEY,
  setServerApiToken,
  uninstallAuthenticatedFetchForTests,
} from './api-auth';

describe('api auth fetch wrapper', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    const values = new Map<string, string>();
    const storage = {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: vi.fn(),
      get length() {
        return values.size;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    } as Storage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });
    window.localStorage.clear();
    uninstallAuthenticatedFetchForTests();
  });

  afterEach(() => {
    uninstallAuthenticatedFetchForTests();
    globalThis.fetch = originalFetch;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reads the configured server API token from localStorage', () => {
    window.localStorage.setItem(SERVER_API_TOKEN_STORAGE_KEY, '  token-value  ');

    expect(getServerApiToken()).toBe('token-value');
  });

  it('stores and clears the configured server API token', () => {
    setServerApiToken('  token-value  ');

    expect(window.localStorage.getItem(SERVER_API_TOKEN_STORAGE_KEY)).toBe('token-value');

    setServerApiToken('');

    expect(window.localStorage.getItem(SERVER_API_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('adds bearer auth to same-origin api requests when a token is stored', async () => {
    window.localStorage.setItem(SERVER_API_TOKEN_STORAGE_KEY, 'secret-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    globalThis.fetch = fetchMock;

    installAuthenticatedFetch();
    await fetch('/api/sync');

    expect(fetchMock).toHaveBeenCalledWith('/api/sync', {
      headers: expect.any(Headers),
    });
    expect(fetchMock.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer secret-token');
  });

  it('preserves existing request headers', async () => {
    window.localStorage.setItem(SERVER_API_TOKEN_STORAGE_KEY, 'secret-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    globalThis.fetch = fetchMock;

    installAuthenticatedFetch();
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/sync', {
      method: 'POST',
      headers: expect.any(Headers),
    });
    expect(fetchMock.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer secret-token');
    expect(fetchMock.mock.calls[0][1].headers.get('Content-Type')).toBe('application/json');
  });

  it('does not add bearer auth to third-party requests', async () => {
    window.localStorage.setItem(SERVER_API_TOKEN_STORAGE_KEY, 'secret-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    globalThis.fetch = fetchMock;

    installAuthenticatedFetch();
    await fetch('https://www.youtube.com/results');

    expect(fetchMock).toHaveBeenCalledWith('https://www.youtube.com/results', undefined);
  });
});
