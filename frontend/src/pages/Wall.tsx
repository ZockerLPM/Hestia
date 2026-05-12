import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { format, isToday, isSameDay, parseISO, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, CheckSquare, Calendar as CalendarIcon, Utensils,
  AlertTriangle, Package, Plus, Check, X, Settings,
} from 'lucide-react';
import { api } from '../api/client';
import type { Task, CalendarEvent, ShoppingItem, MealPlan, PantryItem, ShoppingList } from '../api/types';
import WallPantryEntry from '../components/wall/WallPantryEntry';

export default function Wall() {
  const qc = useQueryClient();
  const [now, setNow] = useState(new Date());
  const [showPantryEntry, setShowPantryEntry] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newShoppingName, setNewShoppingName] = useState('');

  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
  const weekEnd = addDays(dayStart, 7);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    const originalTitle = document.title;
    document.title = 'Hestia — Wand';
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(tick);
      document.title = originalTitle;
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      qc.invalidateQueries({ queryKey: ['shopping-items'] });
      qc.invalidateQueries({ queryKey: ['meal-plans'] });
      qc.invalidateQueries({ queryKey: ['pantry-expiring'] });
    }, 60_000);
    return () => clearInterval(t);
  }, [qc]);

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', 'wall'],
    queryFn: () => api.get('/tasks?completed=false').then((r) => r.data),
  });

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar-events', 'wall-week', format(today, 'yyyy-MM-dd')],
    queryFn: () => api.get(`/calendar/events?start=${dayStart.toISOString()}&end=${weekEnd.toISOString()}`).then((r) => r.data),
  });

  const { data: lists = [] } = useQuery<ShoppingList[]>({
    queryKey: ['shopping-lists'],
    queryFn: () => api.get('/shopping/lists').then((r) => r.data),
  });
  const defaultList = lists.find((l) => l.isDefault) ?? lists[0];

  const { data: shoppingItems = [] } = useQuery<ShoppingItem[]>({
    queryKey: ['shopping-items', defaultList?.id],
    queryFn: () => api.get(`/shopping/lists/${defaultList!.id}/items`).then((r) => r.data),
    enabled: !!defaultList,
  });

  const { data: meals = [] } = useQuery<MealPlan[]>({
    queryKey: ['meal-plans', 'wall', format(today, 'yyyy-MM-dd')],
    queryFn: () => api.get(`/meal-plan?start=${dayStart.toISOString()}&end=${dayEnd.toISOString()}`).then((r) => r.data),
  });

  const { data: expiring = [] } = useQuery<PantryItem[]>({
    queryKey: ['pantry-expiring'],
    queryFn: () => api.get('/pantry/expiring-soon').then((r) => r.data),
  });

  // --- Mutations ---

  const toggleTask = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      api.put(`/tasks/${id}`, { completed }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const addTask = useMutation({
    mutationFn: (title: string) => api.post('/tasks', { title, priority: 'medium' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setNewTaskTitle('');
      toast.success('Aufgabe angelegt');
    },
  });

  const toggleShopping = useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: boolean }) =>
      api.put(`/shopping/items/${id}`, { checked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-items'] }),
  });

  const addShopping = useMutation({
    mutationFn: (name: string) =>
      api.post('/shopping/items', { listId: defaultList!.id, name, quantity: 1, unit: 'Stück' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping-items'] });
      qc.invalidateQueries({ queryKey: ['shopping-lists'] });
      setNewShoppingName('');
      toast.success('Auf die Liste');
    },
  });

  const cookMeal = useMutation({
    mutationFn: (id: string) => api.post(`/meal-plan/${id}/cook`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['meal-plans'] });
      qc.invalidateQueries({ queryKey: ['pantry-items'] });
      const missing = res.data.missing as Array<{ name: string }>;
      if (missing.length > 0) toast(`Gekocht — ${missing.length} fehlt im Vorrat`, { icon: '⚠️' });
      else toast.success('Gekocht — Vorräte angepasst');
    },
  });

  const todayTasks = tasks
    .filter((t) => !t.dueDate || isToday(parseISO(t.dueDate)) || parseISO(t.dueDate) < today)
    .sort((a, b) => {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
    });
  const upcomingTasks = tasks.filter((t) => t.dueDate && parseISO(t.dueDate) > today).slice(0, 5);
  const todayEvents = events.filter((e) => isSameDay(parseISO(e.startDate), today));
  const upcomingEvents = events
    .filter((e) => !isSameDay(parseISO(e.startDate), today) && parseISO(e.startDate) > today)
    .slice(0, 4);
  const openShopping = shoppingItems.filter((i) => !i.checked);
  const todayMeals = meals
    .filter((m) => isSameDay(parseISO(m.date), today))
    .sort((a, b) => {
      const order = ['breakfast', 'lunch', 'dinner', 'snack'];
      return order.indexOf(a.mealType) - order.indexOf(b.mealType);
    });

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* HEADER */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-7xl lg:text-8xl font-bold tabular-nums tracking-tight">
            {format(now, 'HH:mm')}
          </div>
          <div className="text-xl lg:text-2xl text-gray-400 mt-2">
            {format(now, "EEEE, d. MMMM yyyy", { locale: de })}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPantryEntry(true)}
            className="bg-primary-500 hover:bg-primary-600 text-white px-5 py-3 rounded-xl text-lg font-semibold flex items-center gap-2"
          >
            <Package className="w-5 h-5" /> Einkauf eintragen
          </button>
          <Link
            to="/"
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-3 rounded-xl flex items-center gap-2"
          >
            <Settings className="w-5 h-5" />
          </Link>
        </div>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* AUFGABEN */}
        <WallCard icon={CheckSquare} title="Aufgaben heute" count={todayTasks.length} color="#22c55e">
          {todayTasks.length === 0 ? (
            <p className="text-gray-500 text-lg py-4">🎉 Nichts offen.</p>
          ) : (
            <ul className="space-y-1">
              {todayTasks.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => toggleTask.mutate({ id: t.id, completed: true })}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-800 transition-colors text-left"
                  >
                    <span className="w-6 h-6 rounded-full border-2 border-gray-600 flex items-center justify-center shrink-0 hover:border-green-500 hover:bg-green-500/20 transition-colors">
                      <Check className="w-3.5 h-3.5 opacity-0 hover:opacity-100" />
                    </span>
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      t.priority === 'high' ? 'bg-red-500' : t.priority === 'medium' ? 'bg-amber-400' : 'bg-gray-500'
                    }`} />
                    <span className="flex-1 truncate text-lg">{t.title}</span>
                    {t.assignedTo && (
                      <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: t.assignedTo.color }}>
                        {t.assignedTo.name.charAt(0)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {todayTasks.length > 6 && <li className="text-sm text-gray-500 px-2">+{todayTasks.length - 6} weitere</li>}
            </ul>
          )}
          <InlineAdd
            value={newTaskTitle}
            onChange={setNewTaskTitle}
            onSubmit={() => newTaskTitle.trim() && addTask.mutate(newTaskTitle.trim())}
            placeholder="Neue Aufgabe…"
          />
        </WallCard>

        {/* TERMINE */}
        <WallCard icon={CalendarIcon} title="Termine heute" count={todayEvents.length} color="#6366f1">
          {todayEvents.length === 0 ? (
            <p className="text-gray-500 text-lg py-4">Keine Termine.</p>
          ) : (
            <ul className="space-y-2">
              {todayEvents.slice(0, 5).map((e) => (
                <li key={`${e.id}-${e.startDate}`} className="flex items-center gap-3 text-lg px-2 py-1">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                  <span className="flex-1 truncate">{e.title}</span>
                  {!e.allDay && (
                    <span className="text-sm text-gray-400 tabular-nums">
                      {format(parseISO(e.startDate), 'HH:mm')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {upcomingEvents.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Nächste Tage</p>
              <ul className="space-y-1">
                {upcomingEvents.map((e) => (
                  <li key={`${e.id}-${e.startDate}`} className="flex items-center gap-2 text-sm text-gray-400">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                    <span className="flex-1 truncate">{e.title}</span>
                    <span className="text-xs">{format(parseISO(e.startDate), 'd.M.', { locale: de })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </WallCard>

        {/* MAHLZEITEN */}
        <WallCard icon={Utensils} title="Mahlzeiten heute" count={todayMeals.length} color="#ec4899">
          {todayMeals.length === 0 ? (
            <p className="text-gray-500 text-lg py-4">Nichts geplant.</p>
          ) : (
            <ul className="space-y-1">
              {todayMeals.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => {
                      if (m.cooked) return;
                      if (m.recipe && confirm(`"${m.recipe.title}" als gekocht markieren? Vorräte werden abgezogen.`)) {
                        cookMeal.mutate(m.id);
                      } else if (!m.recipe) {
                        cookMeal.mutate(m.id);
                      }
                    }}
                    disabled={m.cooked}
                    className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors ${
                      m.cooked ? 'opacity-50' : 'hover:bg-gray-800'
                    }`}
                  >
                    <span className="text-xs uppercase text-gray-500 w-14 shrink-0">
                      {m.mealType === 'breakfast' ? 'Früh' : m.mealType === 'lunch' ? 'Mittag' : m.mealType === 'dinner' ? 'Abend' : 'Snack'}
                    </span>
                    {m.cooked && <Check className="w-4 h-4 text-green-400 shrink-0" />}
                    <span className={`flex-1 truncate text-lg ${m.cooked ? 'line-through' : ''}`}>
                      {m.recipe?.title ?? m.customTitle}
                    </span>
                    <span className="text-xs text-gray-500">{m.servings} P.</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </WallCard>

        {/* EINKAUFSLISTE */}
        <WallCard icon={ShoppingCart} title="Einkaufsliste" count={openShopping.length} color="#f59e0b" wide>
          {openShopping.length === 0 ? (
            <p className="text-gray-500 text-lg py-4">Liste ist leer.</p>
          ) : (
            <ul className="space-y-1 max-h-72 overflow-y-auto pr-1">
              {openShopping.map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => toggleShopping.mutate({ id: i.id, checked: true })}
                    className="w-full flex items-baseline gap-3 px-2 py-2 rounded-lg hover:bg-gray-800 text-left"
                  >
                    <span className="w-5 h-5 rounded-full border-2 border-gray-600 shrink-0" />
                    <span className="flex-1 truncate text-lg">{i.name}</span>
                    <span className="text-sm text-gray-500">{i.quantity} {i.unit}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {defaultList && (
            <InlineAdd
              value={newShoppingName}
              onChange={setNewShoppingName}
              onSubmit={() => newShoppingName.trim() && addShopping.mutate(newShoppingName.trim())}
              placeholder="Auf die Liste setzen…"
            />
          )}
        </WallCard>

        {/* BALD ABLAUFEND */}
        {expiring.length > 0 && (
          <WallCard icon={AlertTriangle} title="Bald ablaufend" count={expiring.length} color="#ef4444">
            <ul className="space-y-1">
              {expiring.slice(0, 6).map((p) => {
                const days = p.expiryDate
                  ? Math.ceil((parseISO(p.expiryDate).getTime() - today.getTime()) / 86400000)
                  : null;
                return (
                  <li key={p.id} className="flex items-baseline gap-3 px-2 py-1.5 text-lg">
                    <Package className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="flex-1 truncate">{p.name}</span>
                    {days !== null && (
                      <span className={`text-xs ${days < 0 ? 'text-red-400' : days <= 2 ? 'text-amber-400' : 'text-gray-500'}`}>
                        {days < 0 ? `${Math.abs(days)}d abgelaufen` : days === 0 ? 'heute' : `${days}d`}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </WallCard>
        )}

        {/* KOMMENDE AUFGABEN */}
        {upcomingTasks.length > 0 && (
          <WallCard icon={CheckSquare} title="Kommende Aufgaben" color="#a3a3a3">
            <ul className="space-y-1">
              {upcomingTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 text-base px-2 py-1.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    t.priority === 'high' ? 'bg-red-500' : t.priority === 'medium' ? 'bg-amber-400' : 'bg-gray-500'
                  }`} />
                  <span className="flex-1 truncate text-gray-300">{t.title}</span>
                  {t.dueDate && (
                    <span className="text-xs text-gray-500">{format(parseISO(t.dueDate), 'd.M.', { locale: de })}</span>
                  )}
                </li>
              ))}
            </ul>
          </WallCard>
        )}
      </div>

      <WallPantryEntry open={showPantryEntry} onClose={() => setShowPantryEntry(false)} />
    </div>
  );
}

function WallCard({ icon: Icon, title, count, color, children, wide = false }: {
  icon: React.ElementType;
  title: string;
  count?: number;
  color: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`bg-gray-900 rounded-2xl p-5 border border-gray-800 ${wide ? 'lg:col-span-2' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5" style={{ color }} />
          <h2 className="font-semibold text-lg">{title}</h2>
        </div>
        {count !== undefined && (
          <span className="text-2xl font-bold tabular-nums" style={{ color }}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function InlineAdd({ value, onChange, onSubmit, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="mt-3 w-full flex items-center gap-2 px-2 py-2 text-gray-500 hover:text-gray-300 text-sm border border-dashed border-gray-700 rounded-lg hover:border-gray-600 transition-colors"
      >
        <Plus className="w-4 h-4" /> {placeholder}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); setExpanded(false); }}
      className="mt-3 flex items-center gap-2"
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base focus:outline-none focus:border-primary-500"
      />
      <button type="submit" className="p-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600">
        <Plus className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => { setExpanded(false); onChange(''); }}
        className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-gray-200"
      >
        <X className="w-4 h-4" />
      </button>
    </form>
  );
}
