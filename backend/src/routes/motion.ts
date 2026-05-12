import { Router } from 'express';
import { io } from '../index';

const router = Router();

// Kein Auth — wird vom lokalen PIR-Python-Script aufgerufen (nur loopback erreichbar)
// Optional: MOTION_SECRET in .env setzen für einfache Absicherung
router.post('/', (req, res) => {
  const secret = process.env.MOTION_SECRET;
  if (secret && req.headers['x-motion-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  io.to('household').emit('motion-detected', { ts: Date.now() });
  res.json({ ok: true });
});

export default router;
