import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { useStore } from './store/useStore';
import { MobileLandscapeGate } from './components/MobileLandscapeGate';
import { Toaster } from 'sonner';

const ChannelViewer = lazy(() => import('./components/ChannelViewer').then((module) => ({ default: module.ChannelViewer })));

const AppFallback = () => (
  <div className="app-shell min-h-screen flex items-center justify-center">
    <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

function App() {
  const { theme, checkQuotaReset } = useStore();

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

  return (
    <>
      <Toaster
        position="top-right"
        theme={theme}
        offset={{ top: 'max(4.5rem, calc(env(safe-area-inset-top) + 1rem))', right: '1rem' }}
        mobileOffset={{ top: 'max(4.5rem, calc(env(safe-area-inset-top) + 1rem))', right: '0.75rem', left: '0.75rem' }}
        richColors
        closeButton
      />
      <BrowserRouter>
        <Suspense fallback={<AppFallback />}>
          <MobileLandscapeGate>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/channel/:channelId" element={<ChannelViewer />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </MobileLandscapeGate>
        </Suspense>
      </BrowserRouter>
    </>
  );
}

export default App;
