import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { useStore } from './store/useStore';
import { useSubscriptionStorage } from './hooks/useSubscriptionStorage';
import { MobileLandscapeGate } from './components/MobileLandscapeGate';
import { Toaster } from 'sonner';

const VideoPlayer = lazy(() => import('./components/VideoPlayer').then((module) => ({ default: module.VideoPlayer })));
const ChannelViewer = lazy(() => import('./components/ChannelViewer').then((module) => ({ default: module.ChannelViewer })));
const OPMLUpload = lazy(() => import('./components/OPMLUpload').then((module) => ({ default: module.OPMLUpload })));

const AppFallback = () => (
  <div className="app-shell min-h-screen flex items-center justify-center">
    <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

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
      <div className="app-shell min-h-screen flex items-center justify-center">
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
          <Suspense fallback={<AppFallback />}>
            <MobileLandscapeGate>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/video/:videoId" element={<VideoPlayer />} />
                <Route path="/channel/:channelId" element={<ChannelViewer />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </MobileLandscapeGate>
          </Suspense>
        ) : (
          <Suspense fallback={<AppFallback />}>
            <OPMLUpload onSuccess={() => setHasSubscriptions(true)} />
          </Suspense>
        )}
      </BrowserRouter>
    </>
  );
}

export default App;
