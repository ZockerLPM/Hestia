import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

// Kiosk-Auto-Login: Wenn die URL einen Hash der Form #token=<JWT>
// enthält, in localStorage übernehmen und den Hash sofort aus der URL
// entfernen (damit der Token nicht in der History/Browser-UI sichtbar
// bleibt). Wird vor dem ersten React-Render ausgeführt, sodass der
// AuthStore beim Init bereits den frischen Token sieht.
(() => {
  if (!window.location.hash.startsWith('#token=')) return;
  const token = window.location.hash.slice('#token='.length);
  if (!token) return;
  localStorage.setItem('hestia-token', token);
  // Hash aus der Adressleiste entfernen, ohne Page-Reload
  const cleanUrl = window.location.pathname + window.location.search;
  window.history.replaceState(null, '', cleanUrl);
})();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: { fontSize: '14px', borderRadius: '10px' },
          success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
          error: { duration: 5000, iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
);
