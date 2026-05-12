import { Router } from 'express';
import { prisma } from '../index';
import { auth } from '../middleware/auth';

const router = Router();
router.use(auth);

router.get('/overview', async (req, res) => {
  const now = new Date();
  const year = req.query.year ? Number(req.query.year) : now.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);

  const entries = await prisma.financeEntry.findMany({
    where: { type: 'expense', date: { gte: yearStart, lte: yearEnd } },
    include: { category: true },
  });
  const byCategory = new Map<string, { name: string; icon: string; color: string; total: number }>();
  for (const e of entries) {
    const prev = byCategory.get(e.categoryId) ?? { name: e.category.name, icon: e.category.icon, color: e.category.color, total: 0 };
    prev.total += e.amount;
    byCategory.set(e.categoryId, prev);
  }
  const topCategories = [...byCategory.values()].sort((a, b) => b.total - a.total).slice(0, 8);

  const since = new Date(now);
  since.setDate(since.getDate() - 90);
  const tasksDone = await prisma.task.findMany({
    where: { completed: true, completedAt: { gte: since } },
    include: { assignedTo: { select: { id: true, name: true, color: true } } },
  });
  const fairness = new Map<string, { name: string; color: string; count: number }>();
  for (const t of tasksDone) {
    if (!t.assignedTo) continue;
    const prev = fairness.get(t.assignedTo.id) ?? { name: t.assignedTo.name, color: t.assignedTo.color, count: 0 };
    prev.count++;
    fairness.set(t.assignedTo.id, prev);
  }
  const fairnessArr = [...fairness.values()].sort((a, b) => b.count - a.count);

  const thirty = new Date(now);
  thirty.setDate(thirty.getDate() - 30);
  const recentTasks = await prisma.task.count({ where: { createdAt: { gte: thirty } } });
  const recentEntries = await prisma.financeEntry.count({ where: { createdAt: { gte: thirty } } });
  const recentItems = await prisma.shoppingItem.count({ where: { createdAt: { gte: thirty } } });
  const pantryCount = await prisma.pantryItem.count();
  const recipeCount = await prisma.recipe.count();

  const expired = await prisma.pantryItem.count({ where: { expiryDate: { lt: now } } });

  res.json({
    topCategories,
    fairness: fairnessArr,
    activity30d: {
      tasksCreated: recentTasks,
      financeEntries: recentEntries,
      shoppingItems: recentItems,
    },
    totals: { pantry: pantryCount, recipes: recipeCount, expired },
    yearTotalSpent: entries.reduce((s, e) => s + e.amount, 0),
  });
});

export default router;
