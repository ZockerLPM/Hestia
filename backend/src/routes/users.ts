import { Router } from 'express';
import { prisma } from '../index';
import { auth } from '../middleware/auth';

const router = Router();

router.get('/', auth, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, color: true },
  });
  res.json(users);
});

export default router;
