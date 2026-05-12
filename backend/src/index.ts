import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

import authRoutes from './routes/auth';
import financeRoutes from './routes/finance';
import shoppingRoutes from './routes/shopping';
import pantryRoutes from './routes/pantry';
import taskRoutes from './routes/tasks';
import calendarRoutes from './routes/calendar';
import barcodeRoutes from './routes/barcode';
import userRoutes from './routes/users';
import pushRoutes from './routes/push';
import recipeRoutes from './routes/recipes';
import statsRoutes from './routes/stats';
import suggestionsRoutes from './routes/suggestions';
import mealPlanRoutes from './routes/mealPlan';

export const prisma = new PrismaClient();

const app = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/shopping', shoppingRoutes);
app.use('/api/pantry', pantryRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/barcode', barcodeRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/suggestions', suggestionsRoutes);
app.use('/api/meal-plan', mealPlanRoutes);

io.on('connection', (socket) => {
  socket.on('join-household', () => socket.join('household'));
  socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, async () => {
  console.log(`Hestia backend running on port ${PORT}`);

  const { backfillOverdueRecurring } = await import('./lib/recurring');
  const { sendToHousehold } = await import('./lib/push');
  const { runDueRecurringFinance } = await import('./lib/recurringFinance');

  cron.schedule('0 3 * * *', async () => {
    try {
      const spawned = await backfillOverdueRecurring();
      if (spawned > 0) console.log(`[cron] Spawned ${spawned} recurring task(s)`);
    } catch (err) {
      console.error('[cron] recurring backfill failed:', err);
    }
    try {
      const created = await runDueRecurringFinance();
      if (created > 0) console.log(`[cron] Created ${created} recurring finance entr${created === 1 ? 'y' : 'ies'}`);
    } catch (err) {
      console.error('[cron] recurring finance failed:', err);
    }
  });

  cron.schedule('0 8 * * *', async () => {
    try {
      const now = new Date();
      const in7 = new Date(now);
      in7.setDate(in7.getDate() + 7);

      const expiring = await prisma.pantryItem.findMany({
        where: { expiryDate: { gte: now, lte: in7 } },
      });
      const tasksDueToday = await prisma.task.findMany({
        where: {
          completed: false,
          dueDate: { lte: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59) },
        },
      });

      if (expiring.length > 0) {
        await sendToHousehold({
          title: '🥕 Bald ablaufende Produkte',
          body: `${expiring.length} Produkt${expiring.length > 1 ? 'e' : ''} läuft in den nächsten 7 Tagen ab.`,
          url: '/pantry',
          tag: 'pantry-expiring',
        });
      }
      if (tasksDueToday.length > 0) {
        await sendToHousehold({
          title: '✅ Aufgaben für heute',
          body: `${tasksDueToday.length} Aufgabe${tasksDueToday.length > 1 ? 'n' : ''} fällig.`,
          url: '/tasks',
          tag: 'tasks-due',
        });
      }
    } catch (err) {
      console.error('[cron] daily push failed:', err);
    }
  });

  backfillOverdueRecurring()
    .then((n) => n > 0 && console.log(`[startup] Backfilled ${n} recurring task(s)`))
    .catch((err) => console.error('[startup] recurring backfill failed:', err));
});
