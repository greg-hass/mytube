import { useState } from 'react';
import { useStore } from '../store/useStore';
import { youtubeAPI } from '../lib/youtube-api';

declare global {
  interface Window {
    google?: any;
  }
}

export const useYouTubeAuth = () => {
  const { isAuthenticated, setAuth, logout } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!window.google) {
        throw new Error('Google API not loaded');
      }

      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/youtube.readonly',
        callback: (response: any) => {
          if (response.access_token) {
            setAuth(response.access_token);
            youtubeAPI.setAccessToken(response.access_token);
            setIsLoading(false);
          } else {
            setError('Failed to authenticate');
            setIsLoading(false);
          }
        },
        error_callback: (error: any) => {
          console.error('Auth error:', error);
          setError('Authentication failed');
          setIsLoading(false);
        },
      });

      client.requestAccessToken();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    youtubeAPI.setAccessToken(null);
  };

  return {
    isAuthenticated,
    isLoading,
    error,
    login: handleLogin,
    logout: handleLogout,
  };
};
