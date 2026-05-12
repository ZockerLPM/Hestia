import { Router } from 'express';
import { prisma } from '../index';
import { auth, AuthRequest } from '../middleware/auth';
import { getPublicKey, isPushConfigured, sendToHousehold } from '../lib/push';

const router = Router();
router.use(auth);

router.get('/public-key', (_req, res) => {
  res.json({ publicKey: getPublicKey(), enabled: isPushConfigured() });
});

router.post('/subscribe', async (req: AuthRequest, res) => {
  const { endpoint, keys, userAgent } = req.body as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    userAgent?: string;
  };
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      endpoint,
      p256dh: keys.p256dh,
      authKey: keys.auth,
      userAgent,
      userId: req.userId!,
    },
    update: { p256dh: keys.p256dh, authKey: keys.auth, userAgent, userId: req.userId! },
  });
  res.json({ success: true });
});

router.delete('/subscribe', async (req, res) => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
  await prisma.pushSubscription.delete({ where: { endpoint } }).catch(() => {});
  res.json({ success: true });
});

router.post('/test', async (_req, res) => {
  const result = await sendToHousehold({
    title: 'Hestia Test',
    body: 'Push-Notifications funktionieren.',
    url: '/',
    tag: 'hestia-test',
  });
  res.json(result);
});

export default router;
