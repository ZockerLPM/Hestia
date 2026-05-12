import { Router } from 'express';
import { prisma, io } from '../index';
import { auth, AuthRequest } from '../middleware/auth';
import { spawnRecurringClone } from '../lib/recurring';

const router = Router();
router.use(auth);

router.get('/', async (req, res) => {
  const { completed, assignedToId, priority } = req.query;
  const where: Record<string, unknown> = {};
  if (completed !== undefined) where.completed = completed === 'true';
  if (assignedToId) where.assignedToId = assignedToId;
  if (priority) where.priority = priority;

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignedTo: { select: { id: true, name: true, color: true } },
      createdBy: { select: { id: true, name: true, color: true } },
    },
    orderBy: [{ completed: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
  });
  res.json(tasks);
});

router.post('/', async (req: AuthRequest, res) => {
  const { title, description, priority, dueDate, assignedToId, recurring } = req.body;
  const task = await prisma.task.create({
    data: {
      title,
      description,
      priority: priority || 'medium',
      dueDate: dueDate ? new Date(dueDate) : null,
      assignedToId: assignedToId || null,
      createdById: req.userId,
      recurring: recurring || null,
    },
    include: {
      assignedTo: { select: { id: true, name: true, color: true } },
      createdBy: { select: { id: true, name: true, color: true } },
    },
  });
  io.to('household').emit('tasks:created', task);
  res.json(task);
});

router.put('/:id', async (req: AuthRequest, res) => {
  const { title, description, priority, dueDate, assignedToId, completed, recurring } = req.body;
  const data: Record<string, unknown> = {
    title,
    description,
    priority,
    dueDate: dueDate ? new Date(dueDate) : null,
    assignedToId: assignedToId || null,
    recurring: recurring || null,
  };
  if (completed !== undefined) {
    data.completed = completed;
    data.completedAt = completed ? new Date() : null;
  }
  const task = await prisma.task.update({
    where: { id: String(req.params.id) },
    data,
    include: {
      assignedTo: { select: { id: true, name: true, color: true } },
      createdBy: { select: { id: true, name: true, color: true } },
    },
  });
  io.to('household').emit('tasks:updated', task);

  if (completed === true && task.recurring) {
    await spawnRecurringClone(task.id);
  }

  res.json(task);
});

router.delete('/:id', async (req, res) => {
  await prisma.task.delete({ where: { id: req.params.id } });
  io.to('household').emit('tasks:deleted', { id: req.params.id });
  res.json({ success: true });
});

router.get('/templates/all', async (_req, res) => {
  const templates = await prisma.taskTemplate.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(templates);
});

router.post('/templates', async (req, res) => {
  const { title, description, priority, assignedToId, defaultDueInDays } = req.body;
  const t = await prisma.taskTemplate.create({
    data: {
      title,
      description: description || null,
      priority: priority || 'medium',
      assignedToId: assignedToId || null,
      defaultDueInDays: defaultDueInDays != null ? Number(defaultDueInDays) : null,
    },
  });
  res.json(t);
});

router.put('/templates/:id', async (req, res) => {
  const { title, description, priority, assignedToId, defaultDueInDays } = req.body;
  const data: Record<string, unknown> = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description || null;
  if (priority !== undefined) data.priority = priority;
  if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
  if (defaultDueInDays !== undefined) data.defaultDueInDays = defaultDueInDays != null ? Number(defaultDueInDays) : null;
  const t = await prisma.taskTemplate.update({ where: { id: req.params.id }, data });
  res.json(t);
});

router.delete('/templates/:id', async (req, res) => {
  await prisma.taskTemplate.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

router.post('/templates/:id/spawn', async (req: AuthRequest, res) => {
  const tpl = await prisma.taskTemplate.findUnique({ where: { id: String(req.params.id) } });
  if (!tpl) return res.status(404).json({ error: 'Not found' });
  const dueDate = tpl.defaultDueInDays != null
    ? new Date(Date.now() + tpl.defaultDueInDays * 86400000)
    : null;
  const task = await prisma.task.create({
    data: {
      title: tpl.title,
      description: tpl.description,
      priority: tpl.priority,
      assignedToId: tpl.assignedToId,
      createdById: req.userId,
      dueDate,
    },
    include: {
      assignedTo: { select: { id: true, name: true, color: true } },
      createdBy: { select: { id: true, name: true, color: true } },
    },
  });
  io.to('household').emit('tasks:created', task);
  res.json(task);
});

export default router;
