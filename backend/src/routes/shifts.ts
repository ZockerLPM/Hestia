import { Router } from 'express';
import { prisma } from '../index';
import { auth, AuthRequest } from '../middleware/auth';
import { addDays, setHours, setMinutes, startOfDay, parseISO, format } from 'date-fns';

const router = Router();
router.use(auth);

router.get('/', async (req: AuthRequest, res) => {
  const { userId, upcoming } = req.query;
  const where: Record<string, unknown> = {};
  where.userId = userId ? String(userId) : req.userId;
  if (upcoming === 'true') where.endsAt = { gte: new Date() };
  const shifts = await prisma.workShift.findMany({
    where,
    orderBy: { startsAt: 'asc' },
    take: upcoming === 'true' ? 10 : 200,
  });
  res.json(shifts);
});

router.post('/', async (req: AuthRequest, res) => {
  const { startsAt, endsAt, note } = req.body;
  const shift = await prisma.workShift.create({
    data: {
      userId: req.userId!,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      note: note ?? null,
    },
  });
  res.json(shift);
});

router.put('/:id', async (req: AuthRequest, res) => {
  const existing = await prisma.workShift.findUnique({ where: { id: String(req.params.id) } });
  if (!existing || existing.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
  const { startsAt, endsAt, note } = req.body;
  const shift = await prisma.workShift.update({
    where: { id: existing.id },
    data: {
      startsAt: startsAt ? new Date(startsAt) : undefined,
      endsAt: endsAt ? new Date(endsAt) : undefined,
      note: note ?? undefined,
    },
  });
  res.json(shift);
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const existing = await prisma.workShift.findUnique({ where: { id: String(req.params.id) } });
  if (!existing || existing.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
  await prisma.workShift.delete({ where: { id: existing.id } });
  res.json({ success: true });
});

// ── Shift Patterns ───────────────────────────────────────────────────────────

router.get('/patterns', async (req: AuthRequest, res) => {
  const patterns = await prisma.shiftPattern.findMany({
    where: { userId: req.userId! },
    orderBy: [{ weekday: 'asc' }, { startsAt: 'asc' }],
  });
  res.json(patterns);
});

router.post('/patterns', async (req: AuthRequest, res) => {
  const { weekday, startsAt, endsAt, validFrom, validUntil, note } = req.body;
  const pattern = await prisma.shiftPattern.create({
    data: {
      userId: req.userId!,
      weekday: Number(weekday),
      startsAt: String(startsAt),
      endsAt: String(endsAt),
      validFrom: new Date(validFrom ?? Date.now()),
      validUntil: validUntil ? new Date(validUntil) : null,
      note: note ?? null,
    },
  });
  res.json(pattern);
});

router.put('/patterns/:id', async (req: AuthRequest, res) => {
  const existing = await prisma.shiftPattern.findUnique({ where: { id: String(req.params.id) } });
  if (!existing || existing.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
  const { weekday, startsAt, endsAt, validFrom, validUntil, note } = req.body;
  const pattern = await prisma.shiftPattern.update({
    where: { id: existing.id },
    data: {
      weekday: weekday !== undefined ? Number(weekday) : undefined,
      startsAt: startsAt ?? undefined,
      endsAt: endsAt ?? undefined,
      validFrom: validFrom ? new Date(validFrom) : undefined,
      validUntil: validUntil !== undefined ? (validUntil ? new Date(validUntil) : null) : undefined,
      note: note !== undefined ? note : undefined,
    },
  });
  res.json(pattern);
});

router.delete('/patterns/:id', async (req: AuthRequest, res) => {
  const existing = await prisma.shiftPattern.findUnique({ where: { id: String(req.params.id) } });
  if (!existing || existing.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
  await prisma.shiftPattern.delete({ where: { id: existing.id } });
  res.json({ success: true });
});

// Generiert konkrete WorkShifts aus allen Patterns für die nächsten `days` Tage
// Wird vom Cron-Job täglich aufgerufen, kann auch manuell via POST /shifts/patterns/generate getriggert werden
export async function generateShiftsFromPatterns(days = 14): Promise<number> {
  const now = new Date();
  const horizon = addDays(now, days);
  const patterns = await prisma.shiftPattern.findMany({
    where: {
      validFrom: { lte: horizon },
      OR: [{ validUntil: null }, { validUntil: { gte: now } }],
    },
  });

  let created = 0;
  for (const p of patterns) {
    for (let d = 0; d < days; d++) {
      const candidate = addDays(startOfDay(now), d);
      // date-fns getDay: 0=So, 1=Mo ... wir nutzen 0=Mo
      const jsDay = candidate.getDay(); // 0=Sun
      const ourDay = jsDay === 0 ? 6 : jsDay - 1; // convert: Mo=0 .. So=6
      if (ourDay !== p.weekday) continue;
      if (candidate < startOfDay(p.validFrom)) continue;
      if (p.validUntil && candidate > startOfDay(p.validUntil)) continue;

      const [sh, sm] = p.startsAt.split(':').map(Number);
      const [eh, em] = p.endsAt.split(':').map(Number);
      const startsAt = setMinutes(setHours(candidate, sh), sm);
      const endsAt = setMinutes(setHours(candidate, eh), em);

      // Kein Duplikat anlegen
      const exists = await prisma.workShift.findFirst({
        where: { userId: p.userId, startsAt, endsAt },
      });
      if (!exists) {
        await prisma.workShift.create({
          data: { userId: p.userId, startsAt, endsAt, note: p.note },
        });
        created++;
      }
    }
  }
  return created;
}

router.post('/patterns/generate', async (_req, res) => {
  const created = await generateShiftsFromPatterns(14);
  res.json({ created });
});

export default router;
