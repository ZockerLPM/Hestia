import { Router } from 'express';
import { prisma, io } from '../index';
import { auth, AuthRequest } from '../middleware/auth';
import { getDefaultShoppingListId, autoAddIfBelowMin } from '../lib/autoShop';

const router = Router();
router.use(auth);

interface IngredientInput {
  name: string;
  quantity: number;
  unit?: string;
  pantryItemId?: string | null;
}

router.get('/', async (req, res) => {
  const { search } = req.query;
  const where: Record<string, unknown> = {};
  if (search) where.title = { contains: String(search) };
  const recipes = await prisma.recipe.findMany({
    where,
    include: { ingredients: { orderBy: { order: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(recipes);
});

router.get('/:id', async (req, res) => {
  const recipe = await prisma.recipe.findUnique({
    where: { id: req.params.id },
    include: {
      ingredients: {
        include: { pantryItem: { select: { id: true, name: true, quantity: true, unit: true } } },
        orderBy: { order: 'asc' },
      },
    },
  });
  if (!recipe) return res.status(404).json({ error: 'Not found' });
  res.json(recipe);
});

async function resolvePantryLink(name: string, explicitId?: string | null): Promise<string | null> {
  if (explicitId) return explicitId;
  const match = await prisma.pantryItem.findFirst({
    where: { name: { equals: name } },
  });
  return match?.id ?? null;
}

router.post('/', async (req: AuthRequest, res) => {
  const { title, description, instructions, servings, prepMinutes, imageUrl, tags, ingredients } = req.body as {
    title: string;
    description?: string;
    instructions?: string;
    servings?: number;
    prepMinutes?: number;
    imageUrl?: string;
    tags?: string;
    ingredients?: IngredientInput[];
  };
  const ingList = ingredients ?? [];
  const linked = await Promise.all(
    ingList.map(async (i, idx) => ({
      name: i.name,
      quantity: Number(i.quantity),
      unit: i.unit ?? 'Stück',
      pantryItemId: await resolvePantryLink(i.name, i.pantryItemId),
      order: idx,
    })),
  );
  const recipe = await prisma.recipe.create({
    data: {
      title,
      description,
      instructions,
      servings: servings ?? 2,
      prepMinutes: prepMinutes ?? null,
      imageUrl,
      tags,
      createdById: req.userId,
      ingredients: { create: linked },
    },
    include: { ingredients: { orderBy: { order: 'asc' } } },
  });
  res.json(recipe);
});

router.put('/:id', async (req, res) => {
  const { title, description, instructions, servings, prepMinutes, imageUrl, tags, ingredients } = req.body as {
    title?: string;
    description?: string;
    instructions?: string;
    servings?: number;
    prepMinutes?: number;
    imageUrl?: string;
    tags?: string;
    ingredients?: IngredientInput[];
  };

  await prisma.recipe.update({
    where: { id: req.params.id },
    data: {
      title,
      description,
      instructions,
      servings,
      prepMinutes: prepMinutes ?? null,
      imageUrl,
      tags,
    },
  });

  if (Array.isArray(ingredients)) {
    await prisma.recipeIngredient.deleteMany({ where: { recipeId: req.params.id } });
    const linked = await Promise.all(
      ingredients.map(async (i, idx) => ({
        recipeId: req.params.id,
        name: i.name,
        quantity: Number(i.quantity),
        unit: i.unit ?? 'Stück',
        pantryItemId: await resolvePantryLink(i.name, i.pantryItemId),
        order: idx,
      })),
    );
    await prisma.recipeIngredient.createMany({ data: linked });
  }

  const updated = await prisma.recipe.findUnique({
    where: { id: req.params.id },
    include: { ingredients: { orderBy: { order: 'asc' } } },
  });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  await prisma.recipe.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

router.post('/:id/cook', async (req, res) => {
  const { servings: targetServings } = req.body as { servings?: number };
  const recipe = await prisma.recipe.findUnique({
    where: { id: req.params.id },
    include: { ingredients: true },
  });
  if (!recipe) return res.status(404).json({ error: 'Not found' });

  const factor = targetServings && recipe.servings > 0 ? targetServings / recipe.servings : 1;
  const consumed: Array<{ name: string; quantity: number; unit: string }> = [];
  const missing: Array<{ name: string; needed: number; available: number; unit: string }> = [];
  const updatedItems: string[] = [];

  for (const ing of recipe.ingredients) {
    if (!ing.pantryItemId) continue;
    const pantry = await prisma.pantryItem.findUnique({ where: { id: ing.pantryItemId } });
    if (!pantry) continue;
    const need = ing.quantity * factor;
    const newQty = Math.max(0, pantry.quantity - need);
    if (pantry.quantity < need) {
      missing.push({ name: pantry.name, needed: need, available: pantry.quantity, unit: pantry.unit });
    }
    await prisma.pantryItem.update({ where: { id: pantry.id }, data: { quantity: newQty } });
    consumed.push({ name: pantry.name, quantity: need - (pantry.quantity < need ? need - pantry.quantity : 0), unit: pantry.unit });
    updatedItems.push(pantry.id);
  }

  for (const id of updatedItems) {
    io.to('household').emit('pantry:changed', { type: 'updated', id });
    await autoAddIfBelowMin(id);
  }

  res.json({ success: true, consumed, missing });
});

router.post('/:id/to-shopping', async (req, res) => {
  const { listId: rawListId, servings: targetServings } = req.body as { listId?: string; servings?: number };
  const recipe = await prisma.recipe.findUnique({
    where: { id: req.params.id },
    include: { ingredients: true },
  });
  if (!recipe) return res.status(404).json({ error: 'Not found' });

  const listId = rawListId ?? (await getDefaultShoppingListId());
  if (!listId) return res.status(400).json({ error: 'Keine Einkaufsliste verfügbar' });

  const factor = targetServings && recipe.servings > 0 ? targetServings / recipe.servings : 1;
  let added = 0;
  for (const ing of recipe.ingredients) {
    const qty = ing.quantity * factor;
    const existing = await prisma.shoppingItem.findFirst({
      where: { listId, checked: false, name: ing.name },
    });
    if (existing) {
      const merged = await prisma.shoppingItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + qty },
        include: { addedBy: { select: { id: true, name: true, color: true } } },
      });
      io.to('household').emit('shopping:item-updated', merged);
    } else {
      const created = await prisma.shoppingItem.create({
        data: { listId, name: ing.name, quantity: qty, unit: ing.unit, note: `Aus Rezept: ${recipe.title}` },
        include: { addedBy: { select: { id: true, name: true, color: true } } },
      });
      io.to('household').emit('shopping:item-added', created);
    }
    added++;
  }
  res.json({ success: true, added });
});

export default router;
