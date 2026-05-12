import { api } from './client';

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const cleaned = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(cleaned);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getPushStatus() {
  if (!isPushSupported()) return { supported: false, enabled: false, subscribed: false };
  const { data } = await api.get<{ publicKey: string | null; enabled: boolean }>('/push/public-key');
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  return { supported: true, enabled: data.enabled, subscribed: !!existing, publicKey: data.publicKey };
}

export async function subscribePush() {
  const status = await getPushStatus();
  if (!status.supported) throw new Error('Push wird nicht unterstützt');
  if (!status.enabled || !status.publicKey) throw new Error('Push ist serverseitig nicht konfiguriert');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Benachrichtigungen wurden abgelehnt');

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(status.publicKey),
  });

  const json = sub.toJSON();
  await api.post('/push/subscribe', {
    endpoint: json.endpoint,
    keys: json.keys,
    userAgent: navigator.userAgent,
  });
}

export async function unsubscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api.delete('/push/subscribe', { data: { endpoint: sub.endpoint } });
  await sub.unsubscribe();
}
