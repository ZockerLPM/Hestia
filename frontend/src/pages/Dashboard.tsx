import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Wallet, ShoppingCart, Package, CheckSquare, AlertTriangle, TrendingUp, TrendingDown, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import PushToggle from '../components/PushToggle';
import QuickAdd from '../components/QuickAdd';
import type { FinanceSummary, Task, ShoppingList, PantryItem, Budget } from '../api/types';

function StatCard({ title, value, subtitle, icon: Icon, color, to }: {
  title: string; value: string | number; subtitle?: string;
  icon: React.ElementType; color: string; to: string;
}) {
  return (
    <Link to={to} className="card p-5 hover:shadow-md transition-shadow block">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: summary } = useQuery<FinanceSummary>({
    queryKey: ['finance-summary', year],
    queryFn: () => api.get(`/finance/summary?year=${year}`).then((r) => r.data),
  });

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ['tasks', { completed: false }],
    queryFn: () => api.get('/tasks?completed=false').then((r) => r.data),
  });

  const { data: lists } = useQuery<ShoppingList[]>({
    queryKey: ['shopping-lists'],
    queryFn: () => api.get('/shopping/lists').then((r) => r.data),
  });

  const { data: lowStock } = useQuery<PantryItem[]>({
    queryKey: ['pantry-low-stock'],
    queryFn: () => api.get('/pantry/low-stock').then((r) => r.data),
  });

  const { data: expiring } = useQuery<PantryItem[]>({
    queryKey: ['pantry-expiring'],
    queryFn: () => api.get('/pantry/expiring-soon').then((r) => r.data),
  });

  const { data: budgets = [] } = useQuery<Budget[]>({
    queryKey: ['finance-budgets', month, year],
    queryFn: () => api.get(`/finance/budgets?month=${month}&year=${year}`).then((r) => r.data),
  });

  const budgetAlerts = budgets.filter((b) => b.percent >= 0.8);

  const monthData = summary?.monthlyData[month - 1];
  const totalItems = lists?.reduce((s, l) => s + l._count.items, 0) ?? 0;
  const openTasks = tasks?.length ?? 0;
  const overdueTasks = tasks?.filter((t) => t.dueDate && new Date(t.dueDate) < now).length ?? 0;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Guten {now.getHours() < 12 ? 'Morgen' : now.getHours() < 18 ? 'Tag' : 'Abend'},{' '}
            {user?.name}! 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {format(now, "EEEE, d. MMMM yyyy", { locale: de })}
          </p>
        </div>
        <PushToggle />
      </div>

      {((lowStock?.length ?? 0) > 0 || (expiring?.length ?? 0) > 0) && (
        <div className="space-y-2">
          {(expiring?.length ?? 0) > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              <p className="text-sm text-amber-800">
                <strong>{expiring!.length} Produkt{expiring!.length > 1 ? 'e' : ''}</strong> läuft in den nächsten 7 Tagen ab.
              </p>
              <Link to="/pantry" className="ml-auto text-xs text-amber-600 font-medium hover:underline">Anzeigen →</Link>
            </div>
          )}
          {(lowStock?.length ?? 0) > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-3">
              <Package className="w-5 h-5 text-orange-500 shrink-0" />
              <p className="text-sm text-orange-800">
                <strong>{lowStock!.length} Produkt{lowStock!.length > 1 ? 'e' : ''}</strong> unter Mindestbestand.
              </p>
              <Link to="/pantry" className="ml-auto text-xs text-orange-600 font-medium hover:underline">Anzeigen →</Link>
            </div>
          )}
        </div>
      )}

      {budgetAlerts.length > 0 && (
        <div className={`rounded-xl p-4 flex items-center gap-3 border ${
          budgetAlerts.some((b) => b.percent >= 1)
            ? 'bg-red-50 border-red-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <Target className={`w-5 h-5 shrink-0 ${
            budgetAlerts.some((b) => b.percent >= 1) ? 'text-red-500' : 'text-amber-500'
          }`} />
          <p className={`text-sm ${
            budgetAlerts.some((b) => b.percent >= 1) ? 'text-red-800' : 'text-amber-800'
          }`}>
            {budgetAlerts.length} Budget{budgetAlerts.length > 1 ? 's' : ''} am Limit:{' '}
            {budgetAlerts.slice(0, 3).map((b) => `${b.categoryIcon} ${b.categoryName} (${Math.round(b.percent * 100)}%)`).join(', ')}
          </p>
          <Link to="/finance" className="ml-auto text-xs font-medium hover:underline">Anzeigen →</Link>
        </div>
      )}

      <QuickAdd />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Einnahmen (Monat)" value={`${(monthData?.income ?? 0).toFixed(0)} €`}
          icon={TrendingUp} color="#22c55e" to="/finance" />
        <StatCard title="Ausgaben (Monat)" value={`${(monthData?.expenses ?? 0).toFixed(0)} €`}
          subtitle={`Saldo: ${((monthData?.income ?? 0) - (monthData?.expenses ?? 0)).toFixed(0)} €`}
          icon={TrendingDown} color="#ef4444" to="/finance" />
        <StatCard title="Einkaufslisten" value={totalItems}
          subtitle={`${lists?.length ?? 0} Listen`} icon={ShoppingCart} color="#6366f1" to="/shopping" />
        <StatCard title="Offene Aufgaben" value={openTasks}
          subtitle={overdueTasks > 0 ? `${overdueTasks} überfällig` : undefined}
          icon={CheckSquare} color="#f59e0b" to="/tasks" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-primary-500" /> Aufgaben
            </h2>
            <Link to="/tasks" className="text-xs text-primary-600 hover:underline">Alle →</Link>
          </div>
          {!tasks?.length ? (
            <p className="text-sm text-gray-400">Keine offenen Aufgaben 🎉</p>
          ) : (
            <ul className="space-y-2">
              {tasks.slice(0, 4).map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    t.priority === 'high' ? 'bg-red-500' : t.priority === 'medium' ? 'bg-amber-400' : 'bg-gray-300'
                  }`} />
                  <span className="flex-1 truncate">{t.title}</span>
                  {t.dueDate && (
                    <span className={`text-xs shrink-0 ${new Date(t.dueDate) < now ? 'text-red-500' : 'text-gray-400'}`}>
                      {format(new Date(t.dueDate), 'd.M.')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary-500" /> Jahresübersicht {year}
            </h2>
            <Link to="/finance" className="text-xs text-primary-600 hover:underline">Details →</Link>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Einnahmen</span>
              <span className="font-medium text-green-600">{(summary?.totalIncome ?? 0).toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Ausgaben</span>
              <span className="font-medium text-red-500">{(summary?.totalExpenses ?? 0).toFixed(2)} €</span>
            </div>
            <div className="border-t border-gray-100 pt-2 flex justify-between text-sm">
              <span className="font-medium">Saldo</span>
              <span className={`font-bold ${(summary?.balance ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {(summary?.balance ?? 0).toFixed(2)} €
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
