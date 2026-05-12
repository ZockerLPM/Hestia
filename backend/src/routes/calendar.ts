import { Router } from 'express';
import { prisma, io } from '../index';
import { auth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(auth);

type RecurrenceKind = 'daily' | 'weekly' | 'monthly' | 'yearly';

function advance(date: Date, kind: RecurrenceKind): Date {
  const next = new Date(date);
  switch (kind) {
    case 'daily': next.setDate(next.getDate() + 1); break;
    case 'weekly': next.setDate(next.getDate() + 7); break;
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
    case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
  }
  return next;
}

type EventLike = Record<string, unknown> & {
  startDate: Date;
  endDate: Date;
  recurrence?: string | null;
  recurrenceUntil?: Date | null;
};

function expandRecurring<T extends EventLike>(
  event: T,
  windowStart: Date,
  windowEnd: Date,
): Array<T & { occurrenceStart: Date; occurrenceEnd: Date; isRecurring: boolean }> {
  if (!event.recurrence) {
    return [{ ...event, occurrenceStart: event.startDate, occurrenceEnd: event.endDate, isRecurring: false }];
  }
  const kind = event.recurrence as RecurrenceKind;
  const duration = event.endDate.getTime() - event.startDate.getTime();
  const results: Array<T & { occurrenceStart: Date; occurrenceEnd: Date; isRecurring: boolean }> = [];

  let cursor = new Date(event.startDate);
  const hardStop = event.recurrenceUntil ?? new Date(windowEnd.getTime() + 86400000);

  while (cursor <= windowEnd && cursor <= hardStop && results.length < 500) {
    const occurrenceEnd = new Date(cursor.getTime() + duration);
    if (occurrenceEnd >= windowStart) {
      results.push({
        ...event,
        occurrenceStart: new Date(cursor),
        occurrenceEnd,
        isRecurring: true,
      });
    }
    cursor = advance(cursor, kind);
  }
  return results;
}

router.get('/events', async (req, res) => {
  const { start, end } = req.query;
  const windowStart = start ? new Date(String(start)) : new Date();
  const windowEnd = end ? new Date(String(end)) : new Date(Date.now() + 30 * 86400000);

  const events = await prisma.calendarEvent.findMany({
    where: {
      OR: [
        { startDate: { lte: windowEnd } },
        { recurrence: { not: null } },
      ],
    },
    include: { createdBy: { select: { id: true, name: true, color: true } } },
    orderBy: { startDate: 'asc' },
  });

  const expanded = events.flatMap((e) => expandRecurring(e, windowStart, windowEnd));
  expanded.sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime());

  res.json(
    expanded.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      startDate: e.occurrenceStart,
      endDate: e.occurrenceEnd,
      allDay: e.allDay,
      color: e.color,
      recurrence: e.recurrence,
      recurrenceUntil: e.recurrenceUntil,
      isRecurring: e.isRecurring,
      createdBy: e.createdBy,
    })),
  );
});

router.post('/events', async (req: AuthRequest, res) => {
  const { title, description, startDate, endDate, allDay, color, recurrence, recurrenceUntil } = req.body;
  const event = await prisma.calendarEvent.create({
    data: {
      title,
      description,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      allDay: allDay || false,
      color: color || '#6366f1',
      recurrence: recurrence || null,
      recurrenceUntil: recurrenceUntil ? new Date(recurrenceUntil) : null,
      createdById: req.userId,
    },
    include: { createdBy: { select: { id: true, name: true, color: true } } },
  });
  io.to('household').emit('calendar:created', event);
  res.json(event);
});

router.put('/events/:id', async (req, res) => {
  const { title, description, startDate, endDate, allDay, color, recurrence, recurrenceUntil } = req.body;
  const event = await prisma.calendarEvent.update({
    where: { id: req.params.id },
    data: {
      title,
      description,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      allDay,
      color,
      recurrence: recurrence || null,
      recurrenceUntil: recurrenceUntil ? new Date(recurrenceUntil) : null,
    },
    include: { createdBy: { select: { id: true, name: true, color: true } } },
  });
  io.to('household').emit('calendar:updated', event);
  res.json(event);
});

router.delete('/events/:id', async (req, res) => {
  await prisma.calendarEvent.delete({ where: { id: req.params.id } });
  io.to('household').emit('calendar:deleted', { id: req.params.id });
  res.json({ success: true });
});

export default router;
