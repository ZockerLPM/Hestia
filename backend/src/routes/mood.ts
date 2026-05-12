import { Router } from 'express';
import { prisma } from '../index';
import { auth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(auth);

// Mood-Check-in speichern
router.post('/', async (req: AuthRequest, res) => {
  const { mood, note } = req.body;
  const val = Number(mood);
  if (!val || val < 1 || val > 5) return res.status(400).json({ error: 'mood must be 1–5' });
  const log = await prisma.moodLog.create({
    data: { userId: req.userId!, mood: val, note: note ?? null },
  });
  res.json(log);
});

// Verlauf der letzten 30 Tage
router.get('/', async (req: AuthRequest, res) => {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const logs = await prisma.moodLog.findMany({
    where: { userId: req.userId!, loggedAt: { gte: since } },
    orderBy: { loggedAt: 'asc' },
  });
  res.json(logs);
});

// Letzter Eintrag des heutigen Tages
router.get('/today', async (req: AuthRequest, res) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const log = await prisma.moodLog.findFirst({
    where: { userId: req.userId!, loggedAt: { gte: start } },
    orderBy: { loggedAt: 'desc' },
  });
  res.json(log ?? null);
});

export default router;
