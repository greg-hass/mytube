import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { VideoPlayer } from './components/VideoPlayer';
import { ChannelViewer } from './components/ChannelViewer';
import { useStore } from './store/useStore';
import { youtubeAPI } from './lib/youtube-api';

// Create a client with optimized settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

function App() {
  const { isAuthenticated, accessToken, theme } = useStore();

  // Initialize theme on mount
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Set access token in API client
  useEffect(() => {
    if (accessToken) {
      youtubeAPI.setAccessToken(accessToken);
    }
  }, [accessToken]);

  // Load Google Identity Services
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {isAuthenticated ? (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/video/:videoId" element={<VideoPlayer />} />
            <Route path="/channel/:channelId" element={<ChannelViewer />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : (
          <Login />
        )}
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
