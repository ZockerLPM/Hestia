import { prisma, io } from '../index';

export function advanceFinanceDate(date: Date, interval: string, dayOfMonth?: number | null): Date {
  const next = new Date(date);
  switch (interval) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      if (dayOfMonth) next.setDate(Math.min(dayOfMonth, 28));
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      if (dayOfMonth) next.setDate(Math.min(dayOfMonth, 28));
      break;
  }
  return next;
}

export async function runDueRecurringFinance(): Promise<number> {
  const now = new Date();
  const dueList = await prisma.recurringFinance.findMany({
    where: { active: true, autoCreate: true, nextRunAt: { lte: now } },
  });

  let created = 0;
  for (const r of dueList) {
    let cursor = new Date(r.nextRunAt);
    const stopAt = r.endDate ?? now;

    while (cursor <= now && cursor <= stopAt) {
      const entry = await prisma.financeEntry.create({
        data: {
          type: r.type,
          amount: r.amount,
          description: r.description,
          date: cursor,
          categoryId: r.categoryId,
          userId: r.userId,
        },
      });
      io.to('household').emit('finance:changed', { type: 'created', id: entry.id });
      created++;

      cursor = advanceFinanceDate(cursor, r.interval, r.dayOfMonth);
      if (created > 24) break;
    }

    await prisma.recurringFinance.update({
      where: { id: r.id },
      data: { lastRunAt: now, nextRunAt: cursor },
    });
  }
  return created;
}
