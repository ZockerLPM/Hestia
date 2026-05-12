import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { BarChart3, Trophy, Package, ChefHat, Calendar as CalendarIcon, ShoppingCart, Wallet } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface StatsOverview {
  topCategories: { name: string; icon: string; color: string; total: number }[];
  fairness: { name: string; color: string; count: number }[];
  activity30d: { tasksCreated: number; financeEntries: number; shoppingItems: number };
  totals: { pantry: number; recipes: number; expired: number };
  yearTotalSpent: number;
}

export default function Stats() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());

  const { data } = useQuery<StatsOverview>({
    queryKey: ['stats-overview', year],
    queryFn: () => api.get(`/stats/overview?year=${year}`).then((r) => r.data),
  });

  if (!data) {
    return <div className="card p-10 text-center text-gray-400 text-sm">Statistik wird geladen…</div>;
  }

  const totalFairness = data.fairness.reduce((s, f) => s + f.count, 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary-500" /> Statistiken
        </h1>
        <select className="input w-auto" value={year} onChange={(e) => setYear(+e.target.value)}>
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat icon={Wallet} color="#22c55e" label="Ausgaben gesamt" value={`${data.yearTotalSpent.toFixed(0)} €`} />
        <MiniStat icon={Package} color="#f59e0b" label="Vorräte" value={data.totals.pantry} subtitle={data.totals.expired > 0 ? `${data.totals.expired} abgelaufen` : undefined} />
        <MiniStat icon={ChefHat} color="#6366f1" label="Rezepte" value={data.totals.recipes} />
        <MiniStat icon={CalendarIcon} color="#ec4899" label="Aktiv (30 Tage)"
          value={data.activity30d.tasksCreated + data.activity30d.financeEntries + data.activity30d.shoppingItems}
          subtitle="Einträge insgesamt" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Top-Kategorien {year}</h2>
          {data.topCategories.length === 0 ? (
            <p className="text-sm text-gray-400">Noch keine Ausgaben.</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={data.topCategories} dataKey="total" innerRadius={40} outerRadius={65}>
                    {data.topCategories.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v.toFixed(2)} €`} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex-1 space-y-1.5 text-sm">
                {data.topCategories.slice(0, 6).map((c) => (
                  <li key={c.name} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="flex-1 truncate">{c.icon} {c.name}</span>
                    <span className="text-gray-500">{c.total.toFixed(0)} €</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" /> Aufgaben-Fairness (90 Tage)
          </h2>
          {data.fairness.length === 0 ? (
            <p className="text-sm text-gray-400">Noch keine erledigten Aufgaben.</p>
          ) : (
            <div className="space-y-3">
              {data.fairness.map((f) => {
                const pct = totalFairness > 0 ? f.count / totalFairness : 0;
                return (
                  <div key={f.name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: f.color }}>{f.name.charAt(0)}</span>
                        {f.name}
                      </span>
                      <span className="text-gray-500">{f.count} ({Math.round(pct * 100)}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full transition-all" style={{ width: `${pct * 100}%`, backgroundColor: f.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Aktivität — letzte 30 Tage</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-primary-50 p-4">
            <ShoppingCart className="w-5 h-5 text-primary-500 mx-auto mb-1" />
            <p className="text-xl font-bold">{data.activity30d.shoppingItems}</p>
            <p className="text-xs text-gray-500">Einkaufsartikel</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-4">
            <Wallet className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <p className="text-xl font-bold">{data.activity30d.financeEntries}</p>
            <p className="text-xs text-gray-500">Finanzeinträge</p>
          </div>
          <div className="rounded-lg bg-green-50 p-4">
            <CalendarIcon className="w-5 h-5 text-green-500 mx-auto mb-1" />
            <p className="text-xl font-bold">{data.activity30d.tasksCreated}</p>
            <p className="text-xs text-gray-500">Neue Aufgaben</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, color, label, value, subtitle }: {
  icon: React.ElementType; color: string; label: string; value: string | number; subtitle?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-xl font-bold mt-0.5">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}20` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
    </div>
  );
}
