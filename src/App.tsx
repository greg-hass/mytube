import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { VideoPlayer } from './components/VideoPlayer';
import { ChannelViewer } from './components/ChannelViewer';
import { OPMLUpload } from './components/OPMLUpload';
import { useStore } from './store/useStore';
import { useSubscriptionStorage } from './hooks/useSubscriptionStorage';
import { Toaster } from 'sonner';

function App() {
  const { theme, checkQuotaReset } = useStore();
  const { count, isLoading } = useSubscriptionStorage();
  const [hasSubscriptions, setHasSubscriptions] = useState(false);

  // Check for quota reset on mount
  useEffect(() => {
    checkQuotaReset();
  }, [checkQuotaReset]);

  // Initialize theme on mount
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Check if user has subscriptions
  useEffect(() => {
    if (!isLoading) {
      setHasSubscriptions(count > 0);
    }
  }, [count, isLoading]);

  // Show loading state while checking for subscriptions
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" richColors closeButton />
      <BrowserRouter>
        {hasSubscriptions ? (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/video/:videoId" element={<VideoPlayer />} />
            <Route path="/channel/:channelId" element={<ChannelViewer />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : (
          <OPMLUpload onSuccess={() => setHasSubscriptions(true)} />
        )}
      </BrowserRouter>
    </>
  );
}

export default App;
