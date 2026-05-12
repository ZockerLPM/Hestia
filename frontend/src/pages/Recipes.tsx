import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { Plus, Trash2, Edit2, Search, ShoppingCart, Clock, Users, X, ChefHat, Flame, Utensils, AlertCircle } from 'lucide-react';
import Modal from '../components/ui/Modal';
import ProductAutocomplete from '../components/ProductAutocomplete';
import type { Recipe, RecipeIngredient } from '../api/types';

type IngredientForm = { name: string; quantity: string; unit: string };

const UNITS = ['Stück', 'g', 'kg', 'ml', 'L', 'EL', 'TL', 'Prise', 'Packung'];

const emptyForm = {
  title: '', description: '', instructions: '', servings: '2', prepMinutes: '', tags: '',
};

export default function Recipes() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [ingredients, setIngredients] = useState<IngredientForm[]>([{ name: '', quantity: '1', unit: 'Stück' }]);

  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ['recipes', search],
    queryFn: () => api.get(`/recipes${search ? `?search=${encodeURIComponent(search)}` : ''}`).then((r) => r.data),
  });

  const { data: selected } = useQuery<Recipe>({
    queryKey: ['recipe', selectedId],
    queryFn: () => api.get(`/recipes/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        title: form.title,
        description: form.description || null,
        instructions: form.instructions || null,
        servings: Number(form.servings) || 2,
        prepMinutes: form.prepMinutes ? Number(form.prepMinutes) : null,
        tags: form.tags || null,
        ingredients: ingredients
          .filter((i) => i.name.trim())
          .map((i) => ({ name: i.name, quantity: Number(i.quantity) || 1, unit: i.unit })),
      };
      return editId ? api.put(`/recipes/${editId}`, payload) : api.post('/recipes', payload);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      if (editId) qc.invalidateQueries({ queryKey: ['recipe', editId] });
      toast.success(editId ? 'Rezept aktualisiert' : 'Rezept erstellt');
      setShowModal(false);
      setEditId(null);
      setForm(emptyForm);
      setIngredients([{ name: '', quantity: '1', unit: 'Stück' }]);
      if (!editId && res.data?.id) setSelectedId(res.data.id);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/recipes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      setSelectedId(null);
      toast.success('Rezept gelöscht');
    },
  });

  const toShopping = useMutation({
    mutationFn: (servings: number) => api.post(`/recipes/${selectedId}/to-shopping`, { servings }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['shopping-items'] });
      qc.invalidateQueries({ queryKey: ['shopping-lists'] });
      toast.success(`${res.data.added} Zutat${res.data.added === 1 ? '' : 'en'} auf die Liste`);
    },
  });

  const cook = useMutation({
    mutationFn: (servings: number) => api.post(`/recipes/${selectedId}/cook`, { servings }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pantry-items'] });
      qc.invalidateQueries({ queryKey: ['pantry-low-stock'] });
      if (selectedId) qc.invalidateQueries({ queryKey: ['recipe', selectedId] });
      const missing = res.data.missing as Array<{ name: string }>;
      if (missing.length > 0) {
        toast(`Gekocht — aber ${missing.length} Zutat${missing.length === 1 ? '' : 'en'} war zu wenig im Vorrat`, { icon: '⚠️' });
      } else {
        toast.success('Gekocht — Vorräte abgezogen');
      }
    },
  });

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setIngredients([{ name: '', quantity: '1', unit: 'Stück' }]);
    setShowModal(true);
  };

  const openEdit = (r: Recipe) => {
    setEditId(r.id);
    setForm({
      title: r.title,
      description: r.description ?? '',
      instructions: r.instructions ?? '',
      servings: String(r.servings),
      prepMinutes: r.prepMinutes != null ? String(r.prepMinutes) : '',
      tags: r.tags ?? '',
    });
    setIngredients(
      r.ingredients.length > 0
        ? r.ingredients.map((i) => ({ name: i.name, quantity: String(i.quantity), unit: i.unit }))
        : [{ name: '', quantity: '1', unit: 'Stück' }],
    );
    setShowModal(true);
  };

  const addIngredientRow = () => setIngredients([...ingredients, { name: '', quantity: '1', unit: 'Stück' }]);
  const updateIngredient = (idx: number, patch: Partial<IngredientForm>) =>
    setIngredients(ingredients.map((i, n) => (n === idx ? { ...i, ...patch } : i)));
  const removeIngredient = (idx: number) =>
    setIngredients(ingredients.length > 1 ? ingredients.filter((_, n) => n !== idx) : ingredients);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ChefHat className="w-5 h-5 text-primary-500" /> Rezepte
        </h1>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Rezept
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input className="input pl-9" placeholder="Suchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-2">
          {recipes.length === 0 ? (
            <div className="card p-6 text-center text-gray-400 text-sm">Noch keine Rezepte</div>
          ) : (
            recipes.map((r) => (
              <button key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`card w-full text-left p-3 transition-colors ${
                  selectedId === r.id ? 'ring-2 ring-primary-400' : 'hover:bg-gray-50'
                }`}>
                <p className="font-medium text-sm">{r.title}</p>
                <p className="text-xs text-gray-400 flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {r.servings}</span>
                  {r.prepMinutes != null && (
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {r.prepMinutes} min</span>
                  )}
                  <span>{r.ingredients.length} Zutat{r.ingredients.length === 1 ? '' : 'en'}</span>
                </p>
              </button>
            ))
          )}
        </div>

        <div className="md:col-span-2">
          {selected ? (
            <RecipeDetail recipe={selected}
              onEdit={() => openEdit(selected)}
              onDelete={() => { if (confirm(`"${selected.title}" löschen?`)) remove.mutate(selected.id); }}
              onToShopping={(servings) => toShopping.mutate(servings)}
              onCook={(servings) => {
                if (confirm(`Wirklich "${selected.title}" kochen? Vorräte werden abgezogen.`)) {
                  cook.mutate(servings);
                }
              }}
              shopping={toShopping.isPending}
              cooking={cook.isPending} />
          ) : (
            <div className="card p-10 text-center text-gray-400 text-sm">Wähle ein Rezept aus der Liste.</div>
          )}
        </div>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editId ? 'Rezept bearbeiten' : 'Neues Rezept'}>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
          <div>
            <label className="label">Titel</label>
            <input className="input" value={form.title} required autoFocus
              onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="z.B. Spaghetti Bolognese" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">Portionen</label>
              <input type="number" min="1" className="input" value={form.servings}
                onChange={(e) => setForm({ ...form, servings: e.target.value })} required />
            </div>
            <div>
              <label className="label">Zeit (min)</label>
              <input type="number" min="0" className="input" value={form.prepMinutes}
                onChange={(e) => setForm({ ...form, prepMinutes: e.target.value })} placeholder="optional" />
            </div>
            <div>
              <label className="label">Tags</label>
              <input className="input" value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vegan, schnell" />
            </div>
          </div>
          <div>
            <label className="label">Beschreibung</label>
            <input className="input" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="label">Zutaten</span>
              <button type="button" onClick={addIngredientRow} className="text-xs text-primary-600 hover:underline">
                + Zeile
              </button>
            </div>
            <div className="space-y-1.5">
              {ingredients.map((ing, idx) => (
                <div key={idx} className="flex gap-1.5">
                  <ProductAutocomplete
                    value={ing.name}
                    placeholder="z.B. Hackfleisch"
                    className="flex-1"
                    onChange={(name) => updateIngredient(idx, { name })}
                    onSelect={(s) => updateIngredient(idx, { name: s.name, unit: s.unit || ing.unit })}
                  />
                  <input type="number" min="0" step="0.1" className="input w-20" value={ing.quantity}
                    onChange={(e) => updateIngredient(idx, { quantity: e.target.value })} />
                  <select className="input w-24" value={ing.unit}
                    onChange={(e) => updateIngredient(idx, { unit: e.target.value })}>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <button type="button" onClick={() => removeIngredient(idx)}
                    className="p-2 text-gray-300 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Zubereitung</label>
            <textarea className="input resize-none" rows={4} value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              placeholder="Schritt für Schritt…" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Abbrechen</button>
            <button type="submit" disabled={save.isPending} className="btn-primary">
              {save.isPending ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function RecipeDetail({ recipe, onEdit, onDelete, onToShopping, onCook, shopping, cooking }: {
  recipe: Recipe;
  onEdit: () => void;
  onDelete: () => void;
  onToShopping: (servings: number) => void;
  onCook: (servings: number) => void;
  shopping: boolean;
  cooking: boolean;
}) {
  const [servings, setServings] = useState(recipe.servings);
  const factor = recipe.servings > 0 ? servings / recipe.servings : 1;

  const hasLinked = recipe.ingredients.some((i) => i.pantryItemId);
  const anyMissing = recipe.ingredients.some((i) => {
    if (!i.pantryItem) return false;
    return i.pantryItem.quantity < i.quantity * factor;
  });

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-lg">{recipe.title}</h2>
          {recipe.description && <p className="text-sm text-gray-500 mt-1">{recipe.description}</p>}
          {recipe.tags && <p className="text-xs text-primary-600 mt-1">#{recipe.tags.split(',').map((t) => t.trim()).join(' #')}</p>}
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-primary-500">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
        <span className="flex items-center gap-1.5">
          <Users className="w-4 h-4" />
          <button onClick={() => setServings(Math.max(1, servings - 1))} className="px-1.5 rounded hover:bg-gray-100">−</button>
          <strong>{servings}</strong> Port.
          <button onClick={() => setServings(servings + 1)} className="px-1.5 rounded hover:bg-gray-100">+</button>
        </span>
        {recipe.prepMinutes != null && (
          <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {recipe.prepMinutes} min</span>
        )}
        <div className="ml-auto flex gap-2 flex-wrap">
          <button
            onClick={() => onToShopping(servings)}
            disabled={shopping || recipe.ingredients.length === 0}
            className="btn-secondary flex items-center gap-2 text-sm">
            <ShoppingCart className="w-4 h-4" /> Einkaufsliste
          </button>
          <button
            onClick={() => onCook(servings)}
            disabled={cooking || !hasLinked}
            title={hasLinked ? 'Verknüpfte Zutaten aus dem Vorrat abziehen' : 'Keine Zutat ist mit dem Vorrat verknüpft'}
            className="btn-primary flex items-center gap-2 text-sm">
            <Utensils className="w-4 h-4" /> {cooking ? 'Kochend…' : 'Gekocht!'}
          </button>
        </div>
      </div>

      {anyMissing && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          Manche Zutaten sind nicht ausreichend im Vorrat.
        </div>
      )}

      {recipe.ingredients.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Zutaten</h3>
          <ul className="divide-y divide-gray-50">
            {recipe.ingredients.map((i: RecipeIngredient) => {
              const needed = i.quantity * factor;
              const stocked = i.pantryItem?.quantity;
              const ok = stocked != null && stocked >= needed;
              const low = stocked != null && stocked < needed;
              return (
                <li key={i.id} className="py-1.5 flex items-center justify-between text-sm gap-2">
                  <span className="flex-1">
                    {i.name}
                    {i.pantryItem && (
                      <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                        ok ? 'bg-green-100 text-green-700' : low ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {stocked} {i.pantryItem.unit} im Vorrat
                      </span>
                    )}
                  </span>
                  <span className="text-gray-500">{needed.toFixed(2).replace(/\.?0+$/, '')} {i.unit}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {recipe.instructions && (
        <div>
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-1"><Flame className="w-4 h-4 text-orange-400" /> Zubereitung</h3>
          <p className="text-sm whitespace-pre-line text-gray-700">{recipe.instructions}</p>
        </div>
      )}
    </div>
  );
}
