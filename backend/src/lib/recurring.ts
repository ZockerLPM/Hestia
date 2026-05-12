import { prisma, io } from '../index';

export type Recurring = 'daily' | 'weekly' | 'monthly';

export function nextDueDate(recurring: Recurring, from: Date): Date {
  const next = new Date(from);
  if (recurring === 'daily') next.setDate(next.getDate() + 1);
  else if (recurring === 'weekly') next.setDate(next.getDate() + 7);
  else if (recurring === 'monthly') next.setMonth(next.getMonth() + 1);
  return next;
}

export async function spawnRecurringClone(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || !task.recurring) return null;

  const existingNext = await prisma.task.findFirst({
    where: {
      title: task.title,
      recurring: task.recurring,
      completed: false,
      assignedToId: task.assignedToId,
    },
  });
  if (existingNext) return null;

  const baseDate = task.dueDate ?? new Date();
  const nextDate = nextDueDate(task.recurring as Recurring, baseDate);

  const clone = await prisma.task.create({
    data: {
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: nextDate,
      assignedToId: task.assignedToId,
      createdById: task.createdById,
      recurring: task.recurring,
    },
    include: {
      assignedTo: { select: { id: true, name: true, color: true } },
      createdBy: { select: { id: true, name: true, color: true } },
    },
  });
  io.to('household').emit('tasks:created', clone);
  return clone;
}

export async function backfillOverdueRecurring(): Promise<number> {
  const overdue = await prisma.task.findMany({
    where: {
      recurring: { in: ['daily', 'weekly', 'monthly'] },
      completed: false,
      dueDate: { lt: new Date() },
    },
  });

  let spawned = 0;
  for (const task of overdue) {
    const clone = await spawnRecurringClone(task.id);
    if (clone) spawned++;
  }
  return spawned;
}
