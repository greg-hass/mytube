import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { ChannelViewer } from './components/ChannelViewer';
import { useStore } from './store/useStore';
import { MobileLandscapeGate } from './components/MobileLandscapeGate';
import { Toaster } from 'sonner';
import { useScreenWakeLock } from './hooks/useScreenWakeLock';

function App() {
  const { theme, checkQuotaReset } = useStore();

  useScreenWakeLock();

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
        <MobileLandscapeGate>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/channel/:channelId" element={<ChannelViewer />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MobileLandscapeGate>
      </BrowserRouter>
    </>
  );
}

export default App;
