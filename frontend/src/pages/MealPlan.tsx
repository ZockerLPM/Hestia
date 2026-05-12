import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, ShoppingCart, Utensils, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import Modal from '../components/ui/Modal';
import type { MealPlan, Recipe } from '../api/types';

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Frühstück', emoji: '🥐' },
  { value: 'lunch', label: 'Mittag', emoji: '🥗' },
  { value: 'dinner', label: 'Abend', emoji: '🍽️' },
  { value: 'snack', label: 'Snack', emoji: '🥨' },
] as const;

export default function MealPlanPage() {
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState(new Date());
  const [showAdd, setShowAdd] = useState(false);
  const [addCtx, setAddCtx] = useState<{ date: Date; mealType: typeof MEAL_TYPES[number]['value'] } | null>(null);
  const [form, setForm] = useState({ recipeId: '', customTitle: '', servings: '2', notes: '' });

  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(anchor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: plans = [] } = useQuery<MealPlan[]>({
    queryKey: ['meal-plans', format(weekStart, 'yyyy-MM-dd')],
    queryFn: () =>
      api.get(`/meal-plan?start=${weekStart.toISOString()}&end=${weekEnd.toISOString()}`).then((r) => r.data),
  });

  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ['recipes', ''],
    queryFn: () => api.get('/recipes').then((r) => r.data),
  });

  const add = useMutation({
    mutationFn: () => api.post('/meal-plan', {
      date: addCtx!.date,
      mealType: addCtx!.mealType,
      recipeId: form.recipeId || null,
      customTitle: form.customTitle || null,
      servings: Number(form.servings) || 2,
      notes: form.notes || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meal-plans'] });
      toast.success('Hinzugefügt');
      setShowAdd(false);
      setForm({ recipeId: '', customTitle: '', servings: '2', notes: '' });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/meal-plan/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal-plans'] }),
  });

  const cook = useMutation({
    mutationFn: (id: string) => api.post(`/meal-plan/${id}/cook`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['meal-plans'] });
      qc.invalidateQueries({ queryKey: ['pantry-items'] });
      const missing = res.data.missing as Array<{ name: string }>;
      if (missing.length > 0) toast(`Gekocht — ${missing.length} Zutat${missing.length === 1 ? '' : 'en'} fehlte im Vorrat`, { icon: '⚠️' });
      else toast.success('Gekocht — Vorräte angepasst');
    },
  });

  const weekToShopping = useMutation({
    mutationFn: () => api.post('/meal-plan/week-to-shopping', {
      start: weekStart.toISOString(),
      end: weekEnd.toISOString(),
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['shopping-items'] });
      qc.invalidateQueries({ queryKey: ['shopping-lists'] });
      toast.success(`${res.data.added} Zutat${res.data.added === 1 ? '' : 'en'} zur Einkaufsliste`);
    },
  });

  const openAdd = (date: Date, mealType: typeof MEAL_TYPES[number]['value']) => {
    setAddCtx({ date, mealType });
    setForm({ recipeId: '', customTitle: '', servings: '2', notes: '' });
    setShowAdd(true);
  };

  const planFor = (day: Date, mealType: string) =>
    plans.filter((p) => isSameDay(new Date(p.date), day) && p.mealType === mealType);

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Utensils className="w-5 h-5 text-primary-500" /> Mahlzeitenplaner
        </h1>
        <button onClick={() => weekToShopping.mutate()}
          disabled={weekToShopping.isPending}
          className="btn-primary flex items-center gap-2">
          <ShoppingCart className="w-4 h-4" /> Wocheneinkauf
        </button>
      </div>

      <div className="card flex items-center justify-between px-4 py-3">
        <button onClick={() => setAnchor(subWeeks(anchor, 1))} className="p-1.5 hover:bg-gray-100 rounded">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-semibold text-sm">
          {format(weekStart, 'd. MMM', { locale: de })} – {format(weekEnd, 'd. MMM yyyy', { locale: de })}
        </span>
        <button onClick={() => setAnchor(addWeeks(anchor, 1))} className="p-1.5 hover:bg-gray-100 rounded">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-[100px_repeat(7,minmax(140px,1fr))] gap-2 min-w-[1100px]">
          <div />
          {days.map((d) => (
            <div key={d.toISOString()} className="text-center text-xs font-medium text-gray-500">
              {format(d, 'EEE d.', { locale: de })}
            </div>
          ))}
          {MEAL_TYPES.map((m) => (
            <>
              <div key={`label-${m.value}`} className="text-xs text-gray-500 flex items-center gap-1 px-1">
                <span className="text-base">{m.emoji}</span>{m.label}
              </div>
              {days.map((d) => {
                const cells = planFor(d, m.value);
                return (
                  <div key={`${m.value}-${d.toISOString()}`}
                    className="card p-2 min-h-[72px] space-y-1 hover:bg-gray-50 transition-colors">
                    {cells.map((p) => (
                      <div key={p.id} className={`group relative text-xs rounded px-1.5 py-1 ${
                        p.cooked ? 'bg-green-50 text-green-700 line-through' : 'bg-primary-50 text-primary-700'
                      }`}>
                        <div className="truncate font-medium">{p.recipe?.title ?? p.customTitle}</div>
                        <div className="text-[10px] text-gray-400">{p.servings} Port.</div>
                        <div className="absolute top-0.5 right-0.5 hidden group-hover:flex items-center gap-0.5 bg-white shadow rounded p-0.5">
                          {!p.cooked && p.recipe && (
                            <button onClick={() => cook.mutate(p.id)} title="Gekocht" className="p-0.5 hover:text-green-600">
                              <Utensils className="w-3 h-3" />
                            </button>
                          )}
                          <button onClick={() => remove.mutate(p.id)} title="Entfernen" className="p-0.5 hover:text-red-500">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => openAdd(d, m.value)}
                      className="w-full text-[10px] text-gray-400 hover:text-primary-500 flex items-center justify-center gap-0.5 py-0.5">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)}
        title={addCtx ? `${MEAL_TYPES.find((m) => m.value === addCtx.mealType)?.label} — ${format(addCtx.date, 'EEE d. MMM', { locale: de })}` : ''}
        size="sm">
        <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="space-y-3">
          <div>
            <label className="label">Rezept</label>
            <select className="input" value={form.recipeId}
              onChange={(e) => {
                const r = recipes.find((x) => x.id === e.target.value);
                setForm({ ...form, recipeId: e.target.value, servings: r ? String(r.servings) : form.servings });
              }}>
              <option value="">— eigener Titel —</option>
              {recipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </div>
          {!form.recipeId && (
            <div>
              <label className="label">Titel</label>
              <input className="input" placeholder="z.B. Reste vom Vortag" value={form.customTitle}
                onChange={(e) => setForm({ ...form, customTitle: e.target.value })} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Portionen</label>
              <input type="number" min="1" className="input" value={form.servings}
                onChange={(e) => setForm({ ...form, servings: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Notiz (optional)</label>
            <input className="input" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-between pt-1">
            {addCtx && plans.some((p) => isSameDay(new Date(p.date), addCtx.date) && p.mealType === addCtx.mealType) && (
              <button type="button" onClick={() => {
                planFor(addCtx.date, addCtx.mealType).forEach((p) => remove.mutate(p.id));
                setShowAdd(false);
              }} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Alle entfernen
              </button>
            )}
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Abbrechen</button>
              <button type="submit" disabled={add.isPending} className="btn-primary">Hinzufügen</button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
