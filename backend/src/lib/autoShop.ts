import { prisma, io } from '../index';

export async function getDefaultShoppingListId(): Promise<string | null> {
  const explicit = await prisma.shoppingList.findFirst({ where: { isDefault: true } });
  if (explicit) return explicit.id;
  const fallback = await prisma.shoppingList.findFirst({ orderBy: { createdAt: 'asc' } });
  return fallback?.id ?? null;
}

export async function autoAddIfBelowMin(pantryItemId: string): Promise<void> {
  const item = await prisma.pantryItem.findUnique({ where: { id: pantryItemId } });
  if (!item || item.minQuantity === null || item.minQuantity === undefined) return;
  if (item.quantity > item.minQuantity) return;

  const listId = await getDefaultShoppingListId();
  if (!listId) return;

  const existing = await prisma.shoppingItem.findFirst({
    where: {
      listId,
      checked: false,
      name: { equals: item.name },
    },
  });
  if (existing) return;

  const created = await prisma.shoppingItem.create({
    data: {
      listId,
      name: item.name,
      quantity: Math.max(item.minQuantity, 1),
      unit: item.unit,
      barcode: item.barcode,
      category: item.category,
      note: 'Automatisch ergänzt (Mindestbestand)',
    },
    include: { addedBy: { select: { id: true, name: true, color: true } } },
  });

  io.to('household').emit('shopping:item-added', created);
}
