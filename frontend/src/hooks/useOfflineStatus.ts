import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export function useOfflineStatus() {
  const qc = useQueryClient();
  const [offline, setOffline] = useState(!navigator.onLine);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refreshPending = async () => {
      const { queueSize } = await import('../api/offlineQueue');
      setPending(await queueSize());
    };
    refreshPending();

    const handleOnline = async () => {
      setOffline(false);
      const { flushQueue } = await import('../api/offlineQueue');
      const { sent, failed } = await flushQueue();
      await refreshPending();
      if (sent > 0) {
        toast.success(`${sent} Aktion${sent > 1 ? 'en' : ''} synchronisiert`);
        qc.invalidateQueries();
      }
      if (failed > 0) toast.error(`${failed} Aktion${failed > 1 ? 'en' : ''} fehlgeschlagen`);
    };
    const handleOffline = () => setOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(refreshPending, 4000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [qc]);

  return { offline, pending };
}
