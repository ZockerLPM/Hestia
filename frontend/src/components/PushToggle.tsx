import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Bell, BellOff } from 'lucide-react';
import { getPushStatus, isPushSupported, subscribePush, unsubscribePush } from '../api/push';

export default function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    getPushStatus()
      .then((s) => { setSupported(true); setEnabled(s.enabled); setSubscribed(s.subscribed); })
      .catch(() => setSupported(false));
  }, []);

  if (!supported) return null;
  if (!enabled) {
    return (
      <div className="text-xs text-gray-400 flex items-center gap-2">
        <BellOff className="w-4 h-4" /> Push am Server nicht konfiguriert
      </div>
    );
  }

  const toggle = async () => {
    setBusy(true);
    try {
      if (subscribed) {
        await unsubscribePush();
        setSubscribed(false);
        toast.success('Benachrichtigungen aus');
      } else {
        await subscribePush();
        setSubscribed(true);
        toast.success('Benachrichtigungen an');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler beim Umschalten');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        subscribed
          ? 'bg-primary-50 text-primary-600 hover:bg-primary-100'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
    >
      {subscribed ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
      {subscribed ? 'Benachrichtigungen an' : 'Benachrichtigungen aktivieren'}
    </button>
  );
}
