import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../index';
import { auth, signToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/register', async (req, res) => {
  const { name, email, password, color } = req.body;
  if (!name || !email || !password) {
    res.status(400).json({ error: 'Name, E-Mail und Passwort sind erforderlich' });
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'E-Mail bereits registriert' });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, color: color || '#6366f1' },
    select: { id: true, name: true, email: true, color: true },
  });
  const token = signToken(user.id);
  res.json({ user, token });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    return;
  }
  const token = signToken(user.id);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, color: user.color },
  });
});

router.get('/me', auth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, name: true, email: true, color: true },
  });
  if (!user) { res.status(404).json({ error: 'Benutzer nicht gefunden' }); return; }
  res.json(user);
});

export default router;
