import { Router } from 'express';
import { prisma, io } from '../index';
import { auth } from '../middleware/auth';
import { autoAddIfBelowMin } from '../lib/autoShop';

const router = Router();
router.use(auth);

router.get('/items', async (req, res) => {
  const { category, location, search } = req.query;
  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (location) where.location = location;
  if (search) where.name = { contains: String(search) };

  const items = await prisma.pantryItem.findMany({
    where,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  res.json(items);
});

router.post('/items', async (req, res) => {
  const { name, quantity, unit, barcode, expiryDate, category, location, minQuantity } = req.body;
  const item = await prisma.pantryItem.create({
    data: {
      name,
      quantity: Number(quantity),
      unit: unit || 'Stück',
      barcode,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      category,
      location,
      minQuantity: minQuantity ? Number(minQuantity) : null,
    },
  });
  io.to('household').emit('pantry:changed', { type: 'created', id: item.id });
  await autoAddIfBelowMin(item.id);
  res.json(item);
});

router.put('/items/:id', async (req, res) => {
  const { name, quantity, unit, barcode, expiryDate, category, location, minQuantity } = req.body;
  const item = await prisma.pantryItem.update({
    where: { id: req.params.id },
    data: {
      name,
      quantity: Number(quantity),
      unit,
      barcode,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      category,
      location,
      minQuantity: minQuantity ? Number(minQuantity) : null,
    },
  });
  io.to('household').emit('pantry:changed', { type: 'updated', id: item.id });
  await autoAddIfBelowMin(item.id);
  res.json(item);
});

router.delete('/items/:id', async (req, res) => {
  await prisma.pantryItem.delete({ where: { id: req.params.id } });
  io.to('household').emit('pantry:changed', { type: 'deleted', id: req.params.id });
  res.json({ success: true });
});

router.post('/bulk', async (req, res) => {
  const { ids, action, payload } = req.body as {
    ids: string[];
    action: 'delete' | 'location' | 'category' | 'expiry';
    payload?: { location?: string; category?: string; expiryDate?: string | null };
  };
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No ids' });

  if (action === 'delete') {
    await prisma.pantryItem.deleteMany({ where: { id: { in: ids } } });
  } else if (action === 'location' && payload?.location) {
    await prisma.pantryItem.updateMany({ where: { id: { in: ids } }, data: { location: payload.location } });
  } else if (action === 'category' && payload?.category !== undefined) {
    await prisma.pantryItem.updateMany({ where: { id: { in: ids } }, data: { category: payload.category || null } });
  } else if (action === 'expiry') {
    await prisma.pantryItem.updateMany({
      where: { id: { in: ids } },
      data: { expiryDate: payload?.expiryDate ? new Date(payload.expiryDate) : null },
    });
  } else {
    return res.status(400).json({ error: 'Invalid action' });
  }

  for (const id of ids) io.to('household').emit('pantry:changed', { type: 'updated', id });
  res.json({ success: true, affected: ids.length });
});

router.get('/low-stock', async (_req, res) => {
  const items = await prisma.pantryItem.findMany({
    where: { minQuantity: { not: null } },
  });
  const lowStock = items.filter((i) => i.minQuantity !== null && i.quantity <= i.minQuantity);
  res.json(lowStock);
});

router.get('/expiring-soon', async (_req, res) => {
  const inDays = 7;
  const soon = new Date();
  soon.setDate(soon.getDate() + inDays);
  const items = await prisma.pantryItem.findMany({
    where: { expiryDate: { lte: soon, gte: new Date() } },
    orderBy: { expiryDate: 'asc' },
  });
  res.json(items);
});

export default router;
