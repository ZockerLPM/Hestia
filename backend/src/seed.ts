import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'person1@hestia.local' },
      update: {},
      create: {
        name: 'Person 1',
        email: 'person1@hestia.local',
        passwordHash: await bcrypt.hash('hestia123', 12),
        color: '#6366f1',
      },
    }),
    prisma.user.upsert({
      where: { email: 'person2@hestia.local' },
      update: {},
      create: {
        name: 'Person 2',
        email: 'person2@hestia.local',
        passwordHash: await bcrypt.hash('hestia123', 12),
        color: '#ec4899',
      },
    }),
  ]);

  const expenseCategories = [
    { name: 'Lebensmittel', icon: '🛒', color: '#22c55e', type: 'expense' },
    { name: 'Wohnen & Miete', icon: '🏠', color: '#3b82f6', type: 'expense' },
    { name: 'Transport', icon: '🚗', color: '#f59e0b', type: 'expense' },
    { name: 'Gesundheit', icon: '❤️', color: '#ef4444', type: 'expense' },
    { name: 'Freizeit', icon: '🎉', color: '#a855f7', type: 'expense' },
    { name: 'Kleidung', icon: '👕', color: '#ec4899', type: 'expense' },
    { name: 'Technik', icon: '💻', color: '#6366f1', type: 'expense' },
    { name: 'Versicherungen', icon: '🛡️', color: '#64748b', type: 'expense' },
    { name: 'Sonstiges', icon: '📦', color: '#94a3b8', type: 'expense' },
  ];
  const incomeCategories = [
    { name: 'Gehalt', icon: '💼', color: '#22c55e', type: 'income' },
    { name: 'Freiberuflich', icon: '🖥️', color: '#3b82f6', type: 'income' },
    { name: 'Sonstiges Einkommen', icon: '💰', color: '#f59e0b', type: 'income' },
  ];

  for (const cat of [...expenseCategories, ...incomeCategories]) {
    await prisma.financeCategory.upsert({
      where: { id: cat.name },
      update: {},
      create: { id: cat.name, ...cat },
    });
  }

  await prisma.shoppingList.upsert({
    where: { id: 'main-list' },
    update: {},
    create: { id: 'main-list', name: 'Einkaufsliste' },
  });

  const pantryItems = [
    { name: 'Mehl', quantity: 1000, unit: 'g', category: 'Backwaren', location: 'Vorratskammer', minQuantity: 500 },
    { name: 'Zucker', quantity: 500, unit: 'g', category: 'Backwaren', location: 'Vorratskammer', minQuantity: 200 },
    { name: 'Milch', quantity: 2, unit: 'L', category: 'Milchprodukte', location: 'Kühlschrank', minQuantity: 1 },
    { name: 'Eier', quantity: 6, unit: 'Stück', category: 'Milchprodukte', location: 'Kühlschrank', minQuantity: 3 },
    { name: 'Olivenöl', quantity: 500, unit: 'ml', category: 'Öle & Fette', location: 'Vorratskammer' },
    { name: 'Pasta', quantity: 3, unit: 'Packungen', category: 'Nudeln & Reis', location: 'Vorratskammer', minQuantity: 1 },
  ];

  for (const item of pantryItems) {
    const existing = await prisma.pantryItem.findFirst({ where: { name: item.name } });
    if (!existing) await prisma.pantryItem.create({ data: item });
  }

  await prisma.task.create({
    data: {
      title: 'Hestia einrichten',
      description: 'Benutzer anlegen, Kategorien anpassen, erste Einträge hinzufügen',
      priority: 'high',
      assignedToId: users[0].id,
      createdById: users[0].id,
    },
  });

  console.log('Done! Login: person1@hestia.local / hestia123');
}

main().catch(console.error).finally(() => prisma.$disconnect());
