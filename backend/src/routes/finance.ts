import { Router } from 'express';
import { prisma, io } from '../index';
import { auth, AuthRequest } from '../middleware/auth';
import { advanceFinanceDate, runDueRecurringFinance } from '../lib/recurringFinance';

const router = Router();
router.use(auth);

router.get('/categories', async (_req, res) => {
  const categories = await prisma.financeCategory.findMany({ orderBy: { name: 'asc' } });
  res.json(categories);
});

router.post('/categories', async (req, res) => {
  const { name, icon, color, type, monthlyBudget } = req.body;
  const category = await prisma.financeCategory.create({
    data: { name, icon, color, type, monthlyBudget: monthlyBudget ?? null },
  });
  res.json(category);
});

router.put('/categories/:id', async (req, res) => {
  const { name, icon, color, type, monthlyBudget } = req.body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (icon !== undefined) data.icon = icon;
  if (color !== undefined) data.color = color;
  if (type !== undefined) data.type = type;
  if (monthlyBudget !== undefined) {
    data.monthlyBudget = monthlyBudget === null || monthlyBudget === '' ? null : Number(monthlyBudget);
  }
  const category = await prisma.financeCategory.update({ where: { id: req.params.id }, data });
  res.json(category);
});

router.get('/budgets', async (req, res) => {
  const now = new Date();
  const month = req.query.month ? Number(req.query.month) : now.getMonth() + 1;
  const year = req.query.year ? Number(req.query.year) : now.getFullYear();
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const categories = await prisma.financeCategory.findMany({
    where: { monthlyBudget: { not: null } },
  });
  if (categories.length === 0) return res.json([]);

  const entries = await prisma.financeEntry.findMany({
    where: {
      type: 'expense',
      categoryId: { in: categories.map((c) => c.id) },
      date: { gte: start, lte: end },
    },
  });

  const totals = new Map<string, number>();
  for (const e of entries) totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + e.amount);

  const budgets = categories.map((c) => {
    const spent = totals.get(c.id) ?? 0;
    const limit = c.monthlyBudget!;
    return {
      categoryId: c.id,
      categoryName: c.name,
      categoryIcon: c.icon,
      categoryColor: c.color,
      limit,
      spent,
      percent: limit > 0 ? spent / limit : 0,
    };
  });

  budgets.sort((a, b) => b.percent - a.percent);
  res.json(budgets);
});

router.get('/entries', async (req, res) => {
  const { month, year, type } = req.query;
  const where: Record<string, unknown> = {};

  if (month && year) {
    const start = new Date(Number(year), Number(month) - 1, 1);
    const end = new Date(Number(year), Number(month), 0, 23, 59, 59);
    where.date = { gte: start, lte: end };
  }
  if (type) where.type = type;

  const entries = await prisma.financeEntry.findMany({
    where,
    include: { category: true, user: { select: { id: true, name: true, color: true } } },
    orderBy: { date: 'desc' },
  });
  res.json(entries);
});

router.post('/entries', async (req: AuthRequest, res) => {
  const { type, amount, description, date, categoryId } = req.body;
  const entry = await prisma.financeEntry.create({
    data: {
      type,
      amount: Number(amount),
      description,
      date: new Date(date),
      categoryId,
      userId: req.userId!,
    },
    include: { category: true, user: { select: { id: true, name: true, color: true } } },
  });
  io.to('household').emit('finance:changed', { type: 'created', id: entry.id });
  res.json(entry);
});

router.put('/entries/:id', async (req, res) => {
  const { type, amount, description, date, categoryId } = req.body;
  const entry = await prisma.financeEntry.update({
    where: { id: req.params.id },
    data: { type, amount: Number(amount), description, date: new Date(date), categoryId },
    include: { category: true, user: { select: { id: true, name: true, color: true } } },
  });
  io.to('household').emit('finance:changed', { type: 'updated', id: entry.id });
  res.json(entry);
});

router.delete('/entries/:id', async (req, res) => {
  await prisma.financeEntry.delete({ where: { id: req.params.id } });
  io.to('household').emit('finance:changed', { type: 'deleted', id: req.params.id });
  res.json({ success: true });
});

router.get('/summary', async (req, res) => {
  const { year } = req.query;
  const currentYear = Number(year) || new Date().getFullYear();
  const start = new Date(currentYear, 0, 1);
  const end = new Date(currentYear, 11, 31, 23, 59, 59);

  const entries = await prisma.financeEntry.findMany({
    where: { date: { gte: start, lte: end } },
  });

  const monthlyData = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    income: 0,
    expenses: 0,
  }));

  for (const entry of entries) {
    const month = entry.date.getMonth();
    if (entry.type === 'income') monthlyData[month].income += entry.amount;
    else monthlyData[month].expenses += entry.amount;
  }

  const totalIncome = entries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const totalExpenses = entries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);

  res.json({ monthlyData, totalIncome, totalExpenses, balance: totalIncome - totalExpenses });
});

router.get('/recurring', async (_req, res) => {
  const list = await prisma.recurringFinance.findMany({ orderBy: { createdAt: 'desc' } });
  const categories = await prisma.financeCategory.findMany();
  const catMap = new Map(categories.map((c) => [c.id, c]));
  res.json(list.map((r) => ({ ...r, category: catMap.get(r.categoryId) ?? null })));
});

router.post('/recurring', async (req: AuthRequest, res) => {
  const { type, amount, description, categoryId, interval, dayOfMonth, startDate, endDate, autoCreate } = req.body;
  const start = new Date(startDate);
  const recurring = await prisma.recurringFinance.create({
    data: {
      type,
      amount: Number(amount),
      description,
      categoryId,
      userId: req.userId!,
      interval,
      dayOfMonth: dayOfMonth ?? null,
      startDate: start,
      endDate: endDate ? new Date(endDate) : null,
      nextRunAt: start,
      autoCreate: autoCreate !== false,
    },
  });
  res.json(recurring);
});

router.put('/recurring/:id', async (req, res) => {
  const { type, amount, description, categoryId, interval, dayOfMonth, startDate, endDate, active, autoCreate, nextRunAt } = req.body;
  const data: Record<string, unknown> = {};
  if (type !== undefined) data.type = type;
  if (amount !== undefined) data.amount = Number(amount);
  if (description !== undefined) data.description = description;
  if (categoryId !== undefined) data.categoryId = categoryId;
  if (interval !== undefined) data.interval = interval;
  if (dayOfMonth !== undefined) data.dayOfMonth = dayOfMonth;
  if (startDate !== undefined) data.startDate = new Date(startDate);
  if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
  if (active !== undefined) data.active = active;
  if (autoCreate !== undefined) data.autoCreate = autoCreate;
  if (nextRunAt !== undefined) data.nextRunAt = new Date(nextRunAt);
  const r = await prisma.recurringFinance.update({ where: { id: req.params.id }, data });
  res.json(r);
});

router.delete('/recurring/:id', async (req, res) => {
  await prisma.recurringFinance.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

router.post('/recurring/:id/apply', async (req: AuthRequest, res) => {
  const r = await prisma.recurringFinance.findUnique({ where: { id: String(req.params.id) } });
  if (!r) return res.status(404).json({ error: 'Not found' });
  const entry = await prisma.financeEntry.create({
    data: {
      type: r.type,
      amount: r.amount,
      description: r.description,
      date: new Date(),
      categoryId: r.categoryId,
      userId: req.userId!,
    },
  });
  io.to('household').emit('finance:changed', { type: 'created', id: entry.id });
  await prisma.recurringFinance.update({
    where: { id: r.id },
    data: {
      lastRunAt: new Date(),
      nextRunAt: advanceFinanceDate(r.nextRunAt, r.interval, r.dayOfMonth),
    },
  });
  res.json({ success: true, entryId: entry.id });
});

router.post('/recurring/run-now', async (_req, res) => {
  const created = await runDueRecurringFinance();
  res.json({ created });
});

export default router;
