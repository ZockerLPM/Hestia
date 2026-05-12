import { LayoutDashboard, Wallet, ShoppingCart, Package, CheckSquare, Calendar, ChefHat, Utensils, BarChart3 } from 'lucide-react';

export const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Start' },
  { to: '/finance', icon: Wallet, label: 'Finanzen' },
  { to: '/shopping', icon: ShoppingCart, label: 'Einkauf' },
  { to: '/pantry', icon: Package, label: 'Vorrat' },
  { to: '/recipes', icon: ChefHat, label: 'Rezepte' },
  { to: '/meal-plan', icon: Utensils, label: 'Plan' },
  { to: '/tasks', icon: CheckSquare, label: 'Aufgaben' },
  { to: '/calendar', icon: Calendar, label: 'Kalender' },
  { to: '/stats', icon: BarChart3, label: 'Statistik' },
] as const;
