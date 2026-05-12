import { Router } from 'express';
import { prisma, io } from '../index';
import { auth } from '../middleware/auth';
import { autoAddIfBelowMin, getDefaultShoppingListId } from '../lib/autoShop';

const router = Router();
router.use(auth);

router.get('/', async (req, res) => {
  const { start, end } = req.query;
  const where: Record<string, unknown> = {};
  if (start && end) {
    where.date = { gte: new Date(String(start)), lte: new Date(String(end)) };
  }
  const plans = await prisma.mealPlan.findMany({
    where,
    include: {
      recipe: {
        select: { id: true, title: true, servings: true, prepMinutes: true },
      },
    },
    orderBy: [{ date: 'asc' }, { mealType: 'asc' }],
  });
  res.json(plans);
});

router.post('/', async (req, res) => {
  const { date, mealType, recipeId, customTitle, servings, notes } = req.body;
  const plan = await prisma.mealPlan.create({
    data: {
      date: new Date(date),
      mealType,
      recipeId: recipeId || null,
      customTitle: customTitle || null,
      servings: Number(servings) || 2,
      notes: notes || null,
    },
    include: { recipe: { select: { id: true, title: true, servings: true, prepMinutes: true } } },
  });
  io.to('household').emit('mealplan:changed', { type: 'created', id: plan.id });
  res.json(plan);
});

router.put('/:id', async (req, res) => {
  const { date, mealType, recipeId, customTitle, servings, cooked, notes } = req.body;
  const data: Record<string, unknown> = {};
  if (date !== undefined) data.date = new Date(date);
  if (mealType !== undefined) data.mealType = mealType;
  if (recipeId !== undefined) data.recipeId = recipeId || null;
  if (customTitle !== undefined) data.customTitle = customTitle || null;
  if (servings !== undefined) data.servings = Number(servings);
  if (notes !== undefined) data.notes = notes || null;
  if (cooked !== undefined) {
    data.cooked = cooked;
    data.cookedAt = cooked ? new Date() : null;
  }
  const plan = await prisma.mealPlan.update({
    where: { id: req.params.id },
    data,
    include: { recipe: { select: { id: true, title: true, servings: true, prepMinutes: true } } },
  });
  io.to('household').emit('mealplan:changed', { type: 'updated', id: plan.id });
  res.json(plan);
});

router.delete('/:id', async (req, res) => {
  await prisma.mealPlan.delete({ where: { id: req.params.id } });
  io.to('household').emit('mealplan:changed', { type: 'deleted', id: req.params.id });
  res.json({ success: true });
});

router.post('/:id/cook', async (req, res) => {
  const plan = await prisma.mealPlan.findUnique({
    where: { id: req.params.id },
    include: { recipe: { include: { ingredients: true } } },
  });
  if (!plan) return res.status(404).json({ error: 'Not found' });

  let missing: Array<{ name: string }> = [];
  if (plan.recipe) {
    const factor = plan.recipe.servings > 0 ? plan.servings / plan.recipe.servings : 1;
    const updated: string[] = [];
    for (const ing of plan.recipe.ingredients) {
      if (!ing.pantryItemId) continue;
      const pantry = await prisma.pantryItem.findUnique({ where: { id: ing.pantryItemId } });
      if (!pantry) continue;
      const need = ing.quantity * factor;
      if (pantry.quantity < need) missing.push({ name: pantry.name });
      await prisma.pantryItem.update({
        where: { id: pantry.id },
        data: { quantity: Math.max(0, pantry.quantity - need) },
      });
      updated.push(pantry.id);
    }
    for (const id of updated) {
      io.to('household').emit('pantry:changed', { type: 'updated', id });
      await autoAddIfBelowMin(id);
    }
  }

  await prisma.mealPlan.update({
    where: { id: plan.id },
    data: { cooked: true, cookedAt: new Date() },
  });
  io.to('household').emit('mealplan:changed', { type: 'updated', id: plan.id });
  res.json({ success: true, missing });
});

router.post('/week-to-shopping', async (req, res) => {
  const { start, end, listId: rawListId } = req.body as { start: string; end: string; listId?: string };
  const listId = rawListId ?? (await getDefaultShoppingListId());
  if (!listId) return res.status(400).json({ error: 'Keine Einkaufsliste verfügbar' });

  const plans = await prisma.mealPlan.findMany({
    where: { date: { gte: new Date(start), lte: new Date(end) }, cooked: false, recipeId: { not: null } },
    include: { recipe: { include: { ingredients: true } } },
  });

  const aggregated = new Map<string, { name: string; quantity: number; unit: string }>();
  for (const plan of plans) {
    if (!plan.recipe) continue;
    const factor = plan.recipe.servings > 0 ? plan.servings / plan.recipe.servings : 1;
    for (const ing of plan.recipe.ingredients) {
      const key = `${ing.name.toLowerCase()}|${ing.unit}`;
      const prev = aggregated.get(key) ?? { name: ing.name, quantity: 0, unit: ing.unit };
      prev.quantity += ing.quantity * factor;
      aggregated.set(key, prev);
    }
  }

  let added = 0;
  for (const [, v] of aggregated) {
    const existing = await prisma.shoppingItem.findFirst({
      where: { listId, checked: false, name: v.name },
    });
    if (existing) {
      const merged = await prisma.shoppingItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + v.quantity },
        include: { addedBy: { select: { id: true, name: true, color: true } } },
      });
      io.to('household').emit('shopping:item-updated', merged);
    } else {
      const created = await prisma.shoppingItem.create({
        data: { listId, name: v.name, quantity: v.quantity, unit: v.unit, note: 'Aus Mahlzeitenplan' },
        include: { addedBy: { select: { id: true, name: true, color: true } } },
      });
      io.to('household').emit('shopping:item-added', created);
    }
    added++;
  }
  res.json({ success: true, added });
});

export default router;
