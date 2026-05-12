import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import toast from 'react-hot-toast';

export function usePwaUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(err) {
      console.error('SW registration failed', err);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast(
      (t) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          Neue Version verfügbar
          <button
            onClick={() => { updateServiceWorker(true); toast.dismiss(t.id); }}
            style={{
              padding: '4px 10px', borderRadius: 6,
              background: '#6366f1', color: '#fff', fontSize: 12, fontWeight: 500,
            }}>
            Neu laden
          </button>
        </span>
      ),
      { duration: Infinity, id: 'pwa-update' },
    );
    setNeedRefresh(false);
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);
}
