import webpush from 'web-push';
import { prisma } from '../index';

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:hestia@example.com';

let configured = false;
if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
} else {
  console.warn('[push] VAPID keys missing — push disabled. Run `npm run push:keys` to generate.');
}

export function isPushConfigured() {
  return configured;
}

export function getPublicKey() {
  return publicKey ?? null;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function sendToHousehold(payload: PushPayload) {
  if (!configured) return { sent: 0, failed: 0 };
  const subs = await prisma.pushSubscription.findMany();
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.authKey } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (err: unknown) {
        failed++;
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {});
        }
      }
    }),
  );

  return { sent, failed };
}
