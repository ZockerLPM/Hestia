export interface User {
  id: string;
  name: string;
  email: string;
  color: string;
}

export interface FinanceCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense' | 'both';
  monthlyBudget: number | null;
}

export interface MealPlan {
  id: string;
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recipeId: string | null;
  customTitle: string | null;
  servings: number;
  cooked: boolean;
  cookedAt: string | null;
  notes: string | null;
  recipe: { id: string; title: string; servings: number; prepMinutes: number | null } | null;
}

export interface RecurringFinance {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  categoryId: string;
  userId: string;
  interval: 'weekly' | 'monthly' | 'yearly';
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  active: boolean;
  autoCreate: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  createdAt: string;
  category: FinanceCategory | null;
}

export interface Budget {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  limit: number;
  spent: number;
  percent: number;
}

export interface FinanceEntry {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  date: string;
  categoryId: string;
  category: FinanceCategory;
  user: Pick<User, 'id' | 'name' | 'color'>;
}

export interface ShoppingList {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  _count: { items: number };
}

export interface ShoppingItem {
  id: string;
  listId: string;
  name: string;
  quantity: number;
  unit: string;
  checked: boolean;
  barcode?: string;
  category?: string;
  note?: string;
  addedBy?: Pick<User, 'id' | 'name' | 'color'>;
  checkedBy?: Pick<User, 'id' | 'name' | 'color'>;
  checkedAt?: string;
  createdAt: string;
}

export interface PantryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  barcode?: string;
  expiryDate?: string;
  category?: string;
  location?: string;
  minQuantity?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskTemplate {
  id: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high';
  assignedToId: string | null;
  defaultDueInDays: number | null;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  recurring?: string;
  assignedTo?: Pick<User, 'id' | 'name' | 'color'>;
  createdBy?: Pick<User, 'id' | 'name' | 'color'>;
  completedAt?: string;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  color: string;
  recurrence?: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  recurrenceUntil?: string | null;
  isRecurring?: boolean;
  createdBy?: Pick<User, 'id' | 'name' | 'color'>;
}

export interface RecipeIngredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  pantryItemId?: string | null;
  order: number;
  pantryItem?: { id: string; name: string; quantity: number; unit: string } | null;
}

export interface Recipe {
  id: string;
  title: string;
  description?: string | null;
  instructions?: string | null;
  servings: number;
  prepMinutes?: number | null;
  imageUrl?: string | null;
  tags?: string | null;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
  ingredients: RecipeIngredient[];
}

export interface FinanceSummary {
  monthlyData: { month: number; income: number; expenses: number }[];
  totalIncome: number;
  totalExpenses: number;
  balance: number;
}
