import { Router } from 'express';
import { prisma } from '../index';
import { auth } from '../middleware/auth';

const router = Router();
router.use(auth);

export interface ProductSuggestion {
  name: string;
  unit: string;
  category: string | null;
  location: string | null;
  barcode: string | null;
  count: number;
  source: 'pantry' | 'shopping' | 'recipe';
}

router.get('/products', async (req, res) => {
  const q = (req.query.q ? String(req.query.q) : '').trim();
  const where = q ? { name: { contains: q } } : {};

  const [pantry, shopping, recipeIngs] = await Promise.all([
    prisma.pantryItem.findMany({ where, take: 50 }),
    prisma.shoppingItem.findMany({ where, take: 100, orderBy: { createdAt: 'desc' } }),
    prisma.recipeIngredient.findMany({ where, take: 50 }),
  ]);

  const merged = new Map<string, ProductSuggestion>();

  for (const p of pantry) {
    merged.set(p.name.toLowerCase(), {
      name: p.name,
      unit: p.unit,
      category: p.category,
      location: p.location,
      barcode: p.barcode,
      count: 10,
      source: 'pantry',
    });
  }

  for (const s of shopping) {
    const key = s.name.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.barcode && s.barcode) existing.barcode = s.barcode;
      if (!existing.category && s.category) existing.category = s.category;
    } else {
      merged.set(key, {
        name: s.name,
        unit: s.unit,
        category: s.category,
        location: null,
        barcode: s.barcode,
        count: 1,
        source: 'shopping',
      });
    }
  }

  for (const r of recipeIngs) {
    const key = r.name.toLowerCase();
    if (!merged.has(key)) {
      merged.set(key, {
        name: r.name,
        unit: r.unit,
        category: null,
        location: null,
        barcode: null,
        count: 1,
        source: 'recipe',
      });
    }
  }

  const results = [...merged.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 12);

  res.json(results);
});

export default router;
