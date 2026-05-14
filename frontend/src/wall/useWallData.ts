import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { format, isToday, isSameDay, parseISO, addDays } from 'date-fns';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import type { Task, CalendarEvent, ShoppingItem, MealPlan, PantryItem, ShoppingList, Budget } from '../api/types';
import { isCountdownEvent } from '../components/wall/cards/CountdownCard';
import { fetchHAStates, type HAState } from '../api/ha';
import { getSocket } from '../api/socket';
import type { WallConfigShape } from './types';
import { DEFAULT_CONFIG, DEFAULT_CARDS } from './types';

// Polling-Intervall für HA-States. Nur als Safety-Net — primärer Pfad
// ist der WebSocket. Daher länger als nötig: 60s.
const HA_REFRESH_MS = 60_000;

const REFRESH_INTERVAL_MS = 60_000;

export function useWallData() {
  const qc = useQueryClient();
  const today = new Date();

  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayEnd   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
  const weekEnd  = addDays(dayStart, 7);

  // Auto-refresh all wall queries every minute
  useEffect(() => {
    const keys = ['tasks', 'calendar-events', 'shopping-items', 'meal-plans', 'pantry-expiring'];
    const t = setInterval(() => {
      keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [qc]);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', 'wall'],
    queryFn: () => api.get('/tasks?completed=false').then((r) => r.data),
  });

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar-events', 'wall-week', format(today, 'yyyy-MM-dd')],
    queryFn: () =>
      api.get(`/calendar/events?start=${dayStart.toISOString()}&end=${weekEnd.toISOString()}`)
        .then((r) => r.data),
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
    queryFn: () =>
      api.get(`/meal-plan?start=${dayStart.toISOString()}&end=${dayEnd.toISOString()}`)
        .then((r) => r.data),
  });

  const { data: expiring = [] } = useQuery<PantryItem[]>({
    queryKey: ['pantry-expiring'],
    queryFn: () => api.get('/pantry/expiring-soon').then((r) => r.data),
  });

  const { data: budgets = [] } = useQuery<Budget[]>({
    queryKey: ['budgets', 'wall'],
    queryFn: () => api.get('/finance/budgets').then((r) => r.data),
    refetchInterval: 5 * 60_000,
  });

  const { data: allCountdownEvents = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar-events', 'countdown'],
    queryFn: () =>
      api.get(
        `/calendar/events?start=${new Date().toISOString()}&end=${addDays(new Date(), 90).toISOString()}`,
      ).then((r) => (r.data as CalendarEvent[]).filter(isCountdownEvent)),
  });

  const { data: wallCfgRaw } = useQuery<WallConfigShape | null>({
    queryKey: ['wall-config'],
    queryFn: () => api.get('/wall/config').then((r) => r.data).catch(() => null),
    staleTime: Infinity,
  });

  // HA-States für alle konfigurierten Entities. Primärer Update-Pfad ist
  // der HA-WebSocket im Backend, der via Socket.io `ha-state-changed`-
  // Events an den 'household'-Room pusht (Effekt darunter). Polling auf
  // 60s bleibt als Safety-Net, falls die WS-Verbindung mal abreißt und
  // der Reconnect noch nicht durch ist.
  const haEntityIds = (wallCfgRaw?.haEntities ?? []).map((e) => e.entityId);
  const haQueryKey = ['ha-states', haEntityIds.join(',')];
  const { data: haStates = [] } = useQuery<HAState[]>({
    queryKey: haQueryKey,
    queryFn: () => fetchHAStates(haEntityIds),
    enabled: haEntityIds.length > 0,
    refetchInterval: HA_REFRESH_MS,
    staleTime: HA_REFRESH_MS / 2,
  });

  // Live-Update-Bridge: Backend pusht state_changed-Events via Socket.io,
  // wir patchen den entsprechenden Eintrag im React-Query-Cache. Wenn der
  // Wand-User mit der eigenen Wand eine Lampe schaltet, kommt der neue
  // State innerhalb von Millisekunden zurück — kein 60s-Lag mehr.
  //
  // setQueriesData mit Prefix-Match, damit auch Caches mit anderen Suffix-
  // Schlüsseln (z.B. HAControlsCard-Optimistic-Patches) korrigiert werden.
  useEffect(() => {
    if (haEntityIds.length === 0) return;
    const sock = getSocket();
    if (!sock) return;
    const interesting = new Set(haEntityIds);
    const handle = (payload: {
      entity_id: string;
      state: string;
      attributes: Record<string, unknown>;
      last_changed: string;
    }) => {
      if (!interesting.has(payload.entity_id)) return;
      qc.setQueriesData<HAState[]>({ queryKey: ['ha-states'] }, (prev) => {
        if (!prev) return prev;
        const idx = prev.findIndex((s) => s.entity_id === payload.entity_id);
        if (idx === -1) return [...prev, payload as HAState];
        const next = [...prev];
        next[idx] = { ...next[idx], ...payload } as HAState;
        return next;
      });
    };
    sock.on('ha-state-changed', handle);
    return () => { sock.off('ha-state-changed', handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [haEntityIds.join(',')]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const toggleTask = useMutation({
    mutationFn: (id: string) => api.put(`/tasks/${id}`, { completed: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const addTask = useMutation({
    mutationFn: (title: string) => api.post('/tasks', { title, priority: 'medium' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Aufgabe angelegt');
    },
  });

  const toggleShopping = useMutation({
    mutationFn: (id: string) => api.put(`/shopping/items/${id}`, { checked: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-items'] }),
  });

  const addShopping = useMutation({
    mutationFn: (name: string) =>
      api.post('/shopping/items', { listId: defaultList!.id, name, quantity: 1, unit: 'Stück' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping-items'] });
      qc.invalidateQueries({ queryKey: ['shopping-lists'] });
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

  const saveWallConfig = useMutation({
    mutationFn: (cfg: WallConfigShape) => api.put('/wall/config', cfg),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wall-config'] }),
  });

  // ── Derived data ───────────────────────────────────────────────────────────

  const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
  const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

  const todayTasks = tasks
    .filter((t) => !t.dueDate || isToday(parseISO(t.dueDate)) || parseISO(t.dueDate) < today)
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1));

  const upcomingTasks = tasks
    .filter((t) => t.dueDate && parseISO(t.dueDate) > today)
    .slice(0, 5);

  const todayEvents = events.filter((e) => isSameDay(parseISO(e.startDate), today));
  const upcomingEvents = events
    .filter((e) => !isSameDay(parseISO(e.startDate), today) && parseISO(e.startDate) > today)
    .slice(0, 4);

  const openShopping = shoppingItems.filter((i) => !i.checked);

  const todayMeals = meals
    .filter((m) => isSameDay(parseISO(m.date), today))
    .sort((a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType));

  // Gespeicherte Config + automatisches Mergen neuer Default-Cards.
  // So bekommt der User nach App-Updates neue Karten-Typen automatisch
  // in seinem WallConfigEditor angezeigt (default disabled, manuell
  // aktivieren). Ohne dieses Merge stecken alte Configs in alten Listen.
  const wallConfig: WallConfigShape = (() => {
    const raw = wallCfgRaw ?? DEFAULT_CONFIG;
    const existingIds = new Set(raw.cards.map((c) => c.id));
    const missing = DEFAULT_CARDS.filter((c) => !existingIds.has(c.id));
    if (missing.length === 0) return raw;
    const merged = [
      ...raw.cards,
      ...missing.map((c, i) => ({ ...c, order: raw.cards.length + i })),
    ];
    return { ...raw, cards: merged };
  })();

  return {
    // data
    todayTasks, upcomingTasks,
    todayEvents, upcomingEvents,
    openShopping, defaultList,
    todayMeals,
    expiring,
    budgets,
    countdownEvents: allCountdownEvents,
    wallConfig,
    haStates,
    // mutations
    toggleTask:     (id: string) => toggleTask.mutate(id),
    addTask:        (title: string) => addTask.mutate(title),
    toggleShopping: (id: string) => toggleShopping.mutate(id),
    addShopping:    (name: string) => addShopping.mutate(name),
    cookMeal:       (id: string) => cookMeal.mutate(id),
    saveWallConfig: (cfg: WallConfigShape) => saveWallConfig.mutate(cfg),
  };
}
