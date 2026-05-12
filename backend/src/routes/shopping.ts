import { Router } from 'express';
import { prisma, io } from '../index';
import { auth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(auth);

router.get('/lists', async (_req, res) => {
  const lists = await prisma.shoppingList.findMany({
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(lists);
});

router.post('/lists', async (req, res) => {
  const list = await prisma.shoppingList.create({ data: { name: req.body.name } });
  res.json(list);
});

router.put('/lists/:id/default', async (req, res) => {
  await prisma.shoppingList.updateMany({ data: { isDefault: false } });
  const list = await prisma.shoppingList.update({
    where: { id: req.params.id },
    data: { isDefault: true },
  });
  res.json(list);
});

router.delete('/lists/:id', async (req, res) => {
  await prisma.shoppingList.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

router.get('/lists/:id/items', async (req, res) => {
  const items = await prisma.shoppingItem.findMany({
    where: { listId: req.params.id },
    include: {
      addedBy: { select: { id: true, name: true, color: true } },
      checkedBy: { select: { id: true, name: true, color: true } },
    },
    orderBy: [{ checked: 'asc' }, { createdAt: 'asc' }],
  });
  res.json(items);
});

router.post('/items', async (req: AuthRequest, res) => {
  const { listId, name, quantity, unit, barcode, category, note } = req.body;
  const item = await prisma.shoppingItem.create({
    data: { listId, name, quantity: quantity || 1, unit: unit || 'Stück', barcode, category, note, addedById: req.userId },
    include: { addedBy: { select: { id: true, name: true, color: true } } },
  });
  io.to('household').emit('shopping:item-added', item);
  res.json(item);
});

router.put('/items/:id', async (req: AuthRequest, res) => {
  const { name, quantity, unit, checked, category, note } = req.body;
  const data: Record<string, unknown> = { name, quantity, unit, category, note };
  if (checked !== undefined) {
    data.checked = checked;
    data.checkedById = checked ? req.userId : null;
    data.checkedAt = checked ? new Date() : null;
  }
  const item = await prisma.shoppingItem.update({
    where: { id: String(req.params.id) },
    data,
    include: {
      addedBy: { select: { id: true, name: true, color: true } },
      checkedBy: { select: { id: true, name: true, color: true } },
    },
  });
  io.to('household').emit('shopping:item-updated', item);
  res.json(item);
});

router.delete('/items/:id', async (req, res) => {
  await prisma.shoppingItem.delete({ where: { id: req.params.id } });
  io.to('household').emit('shopping:item-deleted', { id: req.params.id });
  res.json({ success: true });
});

router.delete('/lists/:id/checked', async (req, res) => {
  await prisma.shoppingItem.deleteMany({ where: { listId: req.params.id, checked: true } });
  io.to('household').emit('shopping:checked-cleared', { listId: req.params.id });
  res.json({ success: true });
});

interface ToPantryItem {
  shoppingItemId: string;
  name: string;
  quantity: number;
  unit: string;
  location?: string | null;
  category?: string | null;
  expiryDate?: string | null;
}

router.post('/lists/:id/to-pantry', async (req, res) => {
  const items = (req.body.items ?? []) as ToPantryItem[];
  let added = 0;
  let updated = 0;

  for (const it of items) {
    const existing = await prisma.pantryItem.findFirst({
      where: { name: { equals: it.name } },
    });
    if (existing) {
      await prisma.pantryItem.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + Number(it.quantity),
          expiryDate: it.expiryDate ? new Date(it.expiryDate) : existing.expiryDate,
          location: it.location ?? existing.location,
          category: it.category ?? existing.category,
        },
      });
      io.to('household').emit('pantry:changed', { type: 'updated', id: existing.id });
      updated++;
    } else {
      const created = await prisma.pantryItem.create({
        data: {
          name: it.name,
          quantity: Number(it.quantity),
          unit: it.unit,
          location: it.location ?? null,
          category: it.category ?? null,
          expiryDate: it.expiryDate ? new Date(it.expiryDate) : null,
        },
      });
      io.to('household').emit('pantry:changed', { type: 'created', id: created.id });
      added++;
    }

    await prisma.shoppingItem.delete({ where: { id: it.shoppingItemId } }).catch(() => {});
    io.to('household').emit('shopping:item-deleted', { id: it.shoppingItemId });
  }

  res.json({ success: true, added, updated });
});

export default router;
