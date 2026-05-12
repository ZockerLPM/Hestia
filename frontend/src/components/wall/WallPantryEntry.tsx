import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Camera, X, Plus, Minus, Save, Trash2, ShoppingCart, Barcode, Search } from 'lucide-react';
import { api } from '../../api/client';
import WheelDatePicker from '../WheelDatePicker';
import CameraScanner from '../CameraScanner';
import type { ShoppingItem, ShoppingList } from '../../api/types';
import type { ProductSuggestion } from '../ProductAutocomplete';

interface DraftItem {
  tempId: string;
  name: string;
  quantity: number;
  unit: string;
  location: string;
  category: string;
  expiryDate: Date | null;
  barcode: string;
  fromShoppingItemId?: string;
}

const LOCATIONS = ['Kühlschrank', 'Tiefkühl', 'Vorratskammer', 'Keller', 'Sonstiges'];
const UNITS = ['Stück', 'g', 'kg', 'ml', 'L', 'Packung', 'Dose', 'Flasche', 'Glas'];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function WallPantryEntry({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [search, setSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastKeyTime = useRef(0);
  const barcodeBuffer = useRef('');

  // Vorschläge aus Backend
  const { data: suggestions = [] } = useQuery<ProductSuggestion[]>({
    queryKey: ['product-suggestions', search],
    queryFn: () =>
      api.get(`/suggestions/products?q=${encodeURIComponent(search)}`, { silent: true }).then((r) => r.data),
    enabled: open && search.length >= 1,
    staleTime: 30_000,
  });

  // Abgehakte Items aus Default-Liste als Vorschläge
  const { data: lists = [] } = useQuery<ShoppingList[]>({
    queryKey: ['shopping-lists'],
    queryFn: () => api.get('/shopping/lists').then((r) => r.data),
    enabled: open,
  });
  const defaultList = lists.find((l) => l.isDefault) ?? lists[0];

  const { data: shoppingItems = [] } = useQuery<ShoppingItem[]>({
    queryKey: ['shopping-items', defaultList?.id],
    queryFn: () => api.get(`/shopping/lists/${defaultList!.id}/items`).then((r) => r.data),
    enabled: open && !!defaultList,
  });
  const checkedShopping = shoppingItems.filter((i) => i.checked);

  // USB-Barcode-Scanner: globaler Keylistener während Modal offen
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const now = Date.now();
      if (now - lastKeyTime.current > 300) barcodeBuffer.current = '';
      lastKeyTime.current = now;
      if (e.key === 'Enter' && barcodeBuffer.current.length >= 4) {
        handleBarcodeScan(barcodeBuffer.current);
        barcodeBuffer.current = '';
      } else if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Fokus auf Suche beim Öffnen
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setDrafts([]);
      setActiveId(null);
      setSearch('');
    }
  }, [open]);

  const addDraft = (partial: Partial<DraftItem>) => {
    const draft: DraftItem = {
      tempId: crypto.randomUUID(),
      name: partial.name ?? '',
      quantity: partial.quantity ?? 1,
      unit: partial.unit ?? 'Stück',
      location: partial.location ?? 'Vorratskammer',
      category: partial.category ?? '',
      expiryDate: partial.expiryDate ?? null,
      barcode: partial.barcode ?? '',
      fromShoppingItemId: partial.fromShoppingItemId,
    };
    setDrafts((d) => [...d, draft]);
    setActiveId(draft.tempId);
    setSearch('');
    setShowSuggestions(false);
    setTimeout(() => inputRef.current?.focus(), 50);
    return draft.tempId;
  };

  const handleBarcodeScan = async (code: string) => {
    setShowScanner(false);
    try {
      const { data } = await api.get(`/barcode/${code}`, { silent: true });
      if (data.product?.name) {
        addDraft({
          name: data.product.name,
          category: data.product.category ?? '',
          barcode: code,
        });
        toast.success(`${data.product.name}`);
      } else {
        addDraft({ barcode: code });
        toast(`Barcode ${code} — Name bitte ergänzen`, { icon: '⚠️' });
      }
    } catch {
      addDraft({ barcode: code });
    }
  };

  const updateDraft = (id: string, patch: Partial<DraftItem>) => {
    setDrafts((d) => d.map((x) => (x.tempId === id ? { ...x, ...patch } : x)));
  };

  const removeDraft = (id: string) => {
    setDrafts((d) => d.filter((x) => x.tempId !== id));
    if (activeId === id) setActiveId(null);
  };

  const takeShoppingItem = (item: ShoppingItem) => {
    addDraft({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category ?? '',
      barcode: item.barcode ?? '',
      fromShoppingItemId: item.id,
    });
  };

  const takeSuggestion = (s: ProductSuggestion) => {
    addDraft({
      name: s.name,
      unit: s.unit,
      category: s.category ?? '',
      location: s.location ?? 'Vorratskammer',
      barcode: s.barcode ?? '',
    });
  };

  const saveAll = useMutation({
    mutationFn: async () => {
      const fromShopping = drafts.filter((d) => d.fromShoppingItemId);
      const direct = drafts.filter((d) => !d.fromShoppingItemId);

      // Über shopping/to-pantry (merget + löscht Shopping-Item)
      if (fromShopping.length > 0 && defaultList) {
        await api.post(`/shopping/lists/${defaultList.id}/to-pantry`, {
          items: fromShopping.map((d) => ({
            shoppingItemId: d.fromShoppingItemId,
            name: d.name,
            quantity: d.quantity,
            unit: d.unit,
            location: d.location,
            category: d.category || undefined,
            expiryDate: d.expiryDate ? d.expiryDate.toISOString() : null,
          })),
        });
      }

      // Direkt-Eingaben: einzeln anlegen
      for (const d of direct) {
        await api.post('/pantry/items', {
          name: d.name,
          quantity: d.quantity,
          unit: d.unit,
          location: d.location,
          category: d.category || undefined,
          barcode: d.barcode || undefined,
          expiryDate: d.expiryDate ? d.expiryDate.toISOString() : null,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pantry-items'] });
      qc.invalidateQueries({ queryKey: ['pantry-low-stock'] });
      qc.invalidateQueries({ queryKey: ['pantry-expiring'] });
      qc.invalidateQueries({ queryKey: ['shopping-items'] });
      qc.invalidateQueries({ queryKey: ['shopping-lists'] });
      toast.success(`${drafts.length} Artikel im Vorrat`);
      onClose();
    },
  });

  if (!open) return null;

  const activeDraft = drafts.find((d) => d.tempId === activeId);

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-950 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        <div>
          <h1 className="text-2xl font-bold">Einkauf in Vorrat</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Scanner anschließen, scannen oder direkt tippen — alles wird gesammelt
          </p>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
          <X className="w-6 h-6" />
        </button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_440px] overflow-hidden">
        {/* LINKS: Eingabe + Sammlung */}
        <section className="overflow-y-auto p-6 space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                ref={inputRef}
                value={search}
                placeholder="Produkt suchen oder eingeben…"
                className="input pl-11 text-lg h-14"
                onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && search.trim()) {
                    e.preventDefault();
                    addDraft({ name: search.trim() });
                  }
                }}
              />
              {showSuggestions && search.length >= 1 && suggestions.length > 0 && (
                <ul className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
                  {suggestions.map((s) => (
                    <li key={`${s.name}-${s.source}`}>
                      <button
                        type="button"
                        onClick={() => takeSuggestion(s)}
                        className="w-full text-left px-4 py-3 hover:bg-primary-50 dark:hover:bg-gray-700 flex items-center gap-3"
                      >
                        <span className="flex-1 text-base">{s.name}</span>
                        <span className="text-xs text-gray-400">
                          {s.unit}{s.category && ` · ${s.category}`}{s.location && ` · ${s.location}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={() => setShowScanner(true)}
              className="h-14 px-5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white flex items-center gap-2 font-medium"
            >
              <Camera className="w-5 h-5" /> Kamera
            </button>
          </div>

          <p className="text-xs text-gray-400 flex items-center gap-2">
            <Barcode className="w-3.5 h-3.5" /> USB-Scanner wird automatisch erkannt — einfach scannen
          </p>

          {checkedShopping.length > 0 && (
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <ShoppingCart className="w-4 h-4 text-primary-500" />
                <h2 className="font-semibold">Eben eingekauft? Tippe zum Übernehmen</h2>
                <span className="text-xs text-gray-400">({checkedShopping.length})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {checkedShopping.map((it) => {
                  const alreadyTaken = drafts.some((d) => d.fromShoppingItemId === it.id);
                  return (
                    <button
                      key={it.id}
                      onClick={() => !alreadyTaken && takeShoppingItem(it)}
                      disabled={alreadyTaken}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        alreadyTaken
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 opacity-60'
                          : 'bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {alreadyTaken && '✓ '}{it.name}
                      <span className="ml-1 text-xs opacity-70">{it.quantity} {it.unit}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-lg">
                Sammlung
                {drafts.length > 0 && (
                  <span className="ml-2 text-sm text-gray-400">({drafts.length})</span>
                )}
              </h2>
            </div>

            {drafts.length === 0 ? (
              <div className="card p-12 text-center text-gray-400">
                <Plus className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>Noch keine Artikel — scanne, tippe oder wähle aus der Einkaufsliste</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {drafts.map((d) => {
                  const active = d.tempId === activeId;
                  return (
                    <li key={d.tempId}>
                      <button
                        type="button"
                        onClick={() => setActiveId(active ? null : d.tempId)}
                        className={`w-full text-left card p-3 flex items-center gap-3 transition-all ${
                          active ? 'ring-2 ring-primary-400' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {d.name || <span className="text-gray-400 italic">Name fehlt</span>}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {d.quantity} {d.unit} · {d.location}
                            {d.expiryDate && ` · MHD ${d.expiryDate.toLocaleDateString('de-DE')}`}
                            {d.fromShoppingItemId && ' · aus Einkaufsliste'}
                          </p>
                        </div>
                        <span
                          role="button"
                          onClick={(e) => { e.stopPropagation(); removeDraft(d.tempId); }}
                          className="p-2 text-gray-300 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* RECHTS: Detail des aktiven Drafts */}
        <aside className="border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-800 overflow-y-auto p-6 bg-white dark:bg-gray-900">
          {activeDraft ? (
            <DraftEditor
              draft={activeDraft}
              onChange={(patch) => updateDraft(activeDraft.tempId, patch)}
              onRemove={() => removeDraft(activeDraft.tempId)}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-center text-gray-400">
              <div>
                <p className="text-sm">Wähle einen Artikel aus der Liste,</p>
                <p className="text-sm">um Menge, Ort und MHD anzupassen.</p>
              </div>
            </div>
          )}
        </aside>
      </div>

      <footer className="border-t border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between bg-white dark:bg-gray-900">
        <p className="text-sm text-gray-500">
          {drafts.length === 0 ? 'Nichts zu speichern' : `${drafts.length} Artikel bereit`}
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary px-6 py-3">Abbrechen</button>
          <button
            onClick={() => saveAll.mutate()}
            disabled={drafts.length === 0 || saveAll.isPending || drafts.some((d) => !d.name)}
            className="btn-primary px-8 py-3 text-base flex items-center gap-2"
          >
            <Save className="w-5 h-5" />
            {saveAll.isPending ? 'Speichere…' : `${drafts.length} in Vorrat`}
          </button>
        </div>
      </footer>

      <CameraScanner open={showScanner} onClose={() => setShowScanner(false)} onScan={handleBarcodeScan} />
    </div>
  );
}

function DraftEditor({ draft, onChange, onRemove }: {
  draft: DraftItem;
  onChange: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="label">Produktname</label>
        <input
          className="input text-lg h-12"
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="z.B. Vollmilch 1,5%"
        />
        {draft.barcode && (
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <Barcode className="w-3 h-3" /> {draft.barcode}
          </p>
        )}
      </div>

      <div>
        <label className="label">Menge</label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange({ quantity: Math.max(0.1, draft.quantity - 1) })}
            className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <Minus className="w-4 h-4" />
          </button>
          <input
            type="number"
            step="0.1"
            min="0"
            className="input text-center text-lg font-semibold h-12 w-24"
            value={draft.quantity}
            onChange={(e) => onChange({ quantity: parseFloat(e.target.value) || 0 })}
          />
          <button
            onClick={() => onChange({ quantity: draft.quantity + 1 })}
            className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <Plus className="w-4 h-4" />
          </button>
          <select
            value={draft.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
            className="input h-12 flex-1"
          >
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Standort</label>
        <div className="grid grid-cols-3 gap-2">
          {LOCATIONS.map((loc) => (
            <button
              key={loc}
              onClick={() => onChange({ location: loc })}
              className={`py-3 rounded-lg text-sm font-medium transition-colors ${
                draft.location === loc
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {loc}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Kategorie (optional)</label>
        <input
          className="input"
          value={draft.category}
          placeholder="z.B. Milchprodukte"
          onChange={(e) => onChange({ category: e.target.value })}
        />
      </div>

      <WheelDatePicker
        value={draft.expiryDate}
        onChange={(d) => onChange({ expiryDate: d })}
      />

      <button
        onClick={onRemove}
        className="w-full py-2.5 text-sm text-red-500 hover:text-red-600 flex items-center justify-center gap-1.5"
      >
        <Trash2 className="w-4 h-4" /> Aus Sammlung entfernen
      </button>
    </div>
  );
}
