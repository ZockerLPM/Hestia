import { Router } from 'express';
import { prisma } from '../index';
import { auth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(auth);

// Wall-Konfiguration des eingeloggten Users laden
router.get('/config', async (req: AuthRequest, res) => {
  const cfg = await prisma.wallConfig.findUnique({ where: { userId: req.userId! } });
  res.json(cfg ? JSON.parse(cfg.config) : null);
});

// Wall-Konfiguration speichern (upsert)
router.put('/config', async (req: AuthRequest, res) => {
  const cfg = await prisma.wallConfig.upsert({
    where: { userId: req.userId! },
    create: { userId: req.userId!, config: JSON.stringify(req.body) },
    update: { config: JSON.stringify(req.body) },
  });
  res.json(JSON.parse(cfg.config));
});

export default router;
