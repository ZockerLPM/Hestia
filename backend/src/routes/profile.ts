import { Router } from 'express';
import { prisma } from '../index';
import { auth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(auth);

const PROFILE_FIELDS = [
  'name', 'color',
  'homeLat', 'homeLng', 'homeLabel',
  'workLat', 'workLng', 'workLabel',
  'commuteMode',
  'weatherLat', 'weatherLng',
] as const;

function sanitizeUser(u: any) {
  const { passwordHash, ...rest } = u;
  return rest;
}

router.get('/me', async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(sanitizeUser(user));
});

router.put('/me', async (req: AuthRequest, res) => {
  const data: Record<string, unknown> = {};
  for (const field of PROFILE_FIELDS) {
    if (req.body[field] !== undefined) data[field] = req.body[field];
  }
  const user = await prisma.user.update({ where: { id: req.userId! }, data });
  res.json(sanitizeUser(user));
});

// Read-only Profil eines anderen Haushaltsmitglieds (für das Wand-Display
// mit User-Switcher, damit jeder seinen Pendelweg/Wetter sehen kann).
// Single-Household-App: alle eingeloggten User dürfen das.
router.get('/:userId', async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: String(req.params.userId) } });
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(sanitizeUser(user));
});

// Alle Descriptors aller User — wird vom Wand-Recognizer benutzt
router.get('/face-descriptors', async (_req, res) => {
  const list = await prisma.faceDescriptor.findMany({
    include: { user: { select: { id: true, name: true, color: true } } },
  });
  res.json(
    list.map((d) => ({
      id: d.id,
      userId: d.userId,
      user: d.user,
      descriptor: JSON.parse(d.descriptor) as number[],
      label: d.label,
    })),
  );
});

router.post('/face-descriptors', async (req: AuthRequest, res) => {
  const { descriptor, label } = req.body as { descriptor: number[]; label?: string };
  if (!Array.isArray(descriptor) || descriptor.length !== 128) {
    return res.status(400).json({ error: 'descriptor must be 128-float array' });
  }
  const created = await prisma.faceDescriptor.create({
    data: {
      userId: req.userId!,
      descriptor: JSON.stringify(descriptor),
      label: label ?? null,
    },
  });
  res.json({ id: created.id });
});

router.delete('/face-descriptors/:id', async (req: AuthRequest, res) => {
  // Nur eigene Descriptors löschen
  const d = await prisma.faceDescriptor.findUnique({ where: { id: String(req.params.id) } });
  if (!d || d.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
  await prisma.faceDescriptor.delete({ where: { id: d.id } });
  res.json({ success: true });
});

export default router;
