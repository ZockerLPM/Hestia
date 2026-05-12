import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { Plus, Trash2, Check, Barcode, X, ShoppingCart, Camera, Pin, Package } from 'lucide-react';
import Modal from '../components/ui/Modal';
import CameraScanner from '../components/CameraScanner';
import ProductAutocomplete from '../components/ProductAutocomplete';
import type { ShoppingList, ShoppingItem } from '../api/types';

function BarcodeInput({ onScan }: { onScan: (code: string) => void }) {
  const [buffer, setBuffer] = useState('');
  const lastKeyTime = useRef(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const now = Date.now();
      if (now - lastKeyTime.current > 300) setBuffer('');
      lastKeyTime.current = now;
      if (e.key === 'Enter' && buffer.length >= 4) {
        onScan(buffer);
        setBuffer('');
      } else if (e.key.length === 1) {
        setBuffer((b) => b + e.key);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [buffer, onScan]);

  return null;
}

function ItemRow({ item, onToggle, onDelete }: {
  item: ShoppingItem;
  onToggle: (checked: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${item.checked ? 'opacity-50' : ''}`}>
      <button onClick={() => onToggle(!item.checked)}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          item.checked ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-primary-500'
        }`}>
        {item.checked && <Check className="w-3 h-3 text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${item.checked ? 'line-through text-gray-400' : ''}`}>{item.name}</p>
        <p className="text-xs text-gray-400">
          {item.quantity} {item.unit}
          {item.category && ` · ${item.category}`}
          {item.note && ` · ${item.note}`}
        </p>
      </div>
      {item.addedBy && (
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-white shrink-0"
          style={{ backgroundColor: item.addedBy.color, fontSize: '9px' }}>
          {item.addedBy.name.charAt(0)}
        </div>
      )}
      <button onClick={onDelete} className="p-1 text-gray-200 hover:text-red-400 transition-colors">
        <Trash2 className="w-4 h-4" />
      </button>
    </li>
  );
}

export default function Shopping() {
  const qc = useQueryClient();
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [showAddList, setShowAddList] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showToPantry, setShowToPantry] = useState(false);
  const [toPantryDraft, setToPantryDraft] = useState<Array<{
    shoppingItemId: string; name: string; quantity: string; unit: string;
    location: string; category: string; expiryDate: string; include: boolean;
  }>>([]);
  const [newListName, setNewListName] = useState('');
  const [itemForm, setItemForm] = useState({ name: '', quantity: '1', unit: 'Stück', category: '', note: '', barcode: '' });

  const { data: lists = [] } = useQuery<ShoppingList[]>({
    queryKey: ['shopping-lists'],
    queryFn: () => api.get('/shopping/lists').then((r) => r.data),
  });

  const { data: items = [] } = useQuery<ShoppingItem[]>({
    queryKey: ['shopping-items', activeListId],
    queryFn: () => api.get(`/shopping/lists/${activeListId}/items`).then((r) => r.data),
    enabled: !!activeListId,
  });

  useEffect(() => {
    if (!activeListId && lists.length > 0) setActiveListId(lists[0].id);
  }, [lists, activeListId]);

  const createList = useMutation({
    mutationFn: (name: string) => api.post('/shopping/lists', { name }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['shopping-lists'] });
      setActiveListId(res.data.id);
      setShowAddList(false);
      setNewListName('');
      toast.success('Liste erstellt');
    },
  });

  const deleteList = useMutation({
    mutationFn: (id: string) => api.delete(`/shopping/lists/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping-lists'] });
      setActiveListId(null);
      toast.success('Liste gelöscht');
    },
  });

  const makeDefault = useMutation({
    mutationFn: (id: string) => api.put(`/shopping/lists/${id}/default`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping-lists'] });
      toast.success('Standard-Liste gesetzt');
    },
  });

  const addItem = useMutation({
    mutationFn: (form: typeof itemForm) =>
      api.post('/shopping/items', { ...form, listId: activeListId, quantity: parseFloat(form.quantity) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping-items', activeListId] });
      qc.invalidateQueries({ queryKey: ['shopping-lists'] });
      setShowAddItem(false);
      setItemForm({ name: '', quantity: '1', unit: 'Stück', category: '', note: '', barcode: '' });
    },
  });

  const toggleItem = useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: boolean }) =>
      api.put(`/shopping/items/${id}`, { checked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-items', activeListId] }),
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => api.delete(`/shopping/items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping-items', activeListId] });
      qc.invalidateQueries({ queryKey: ['shopping-lists'] });
    },
  });

  const clearChecked = useMutation({
    mutationFn: () => api.delete(`/shopping/lists/${activeListId}/checked`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping-items', activeListId] });
      qc.invalidateQueries({ queryKey: ['shopping-lists'] });
      toast.success('Erledigte Artikel entfernt');
    },
  });

  const toPantry = useMutation({
    mutationFn: (payload: { items: Array<{ shoppingItemId: string; name: string; quantity: number; unit: string; location?: string; category?: string; expiryDate?: string | null }> }) =>
      api.post(`/shopping/lists/${activeListId}/to-pantry`, payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['shopping-items', activeListId] });
      qc.invalidateQueries({ queryKey: ['shopping-lists'] });
      qc.invalidateQueries({ queryKey: ['pantry-items'] });
      qc.invalidateQueries({ queryKey: ['pantry-low-stock'] });
      qc.invalidateQueries({ queryKey: ['pantry-expiring'] });
      const { added, updated } = res.data;
      toast.success(`Vorrat aktualisiert (${added} neu, ${updated} ergänzt)`);
      setShowToPantry(false);
    },
  });

  const openToPantry = () => {
    setToPantryDraft(
      items
        .filter((i) => i.checked)
        .map((i) => ({
          shoppingItemId: i.id,
          name: i.name,
          quantity: String(i.quantity),
          unit: i.unit,
          location: 'Vorratskammer',
          category: i.category ?? '',
          expiryDate: '',
          include: true,
        })),
    );
    setShowToPantry(true);
  };

  const handleBarcodeScan = useCallback(async (code: string) => {
    try {
      const { data } = await api.get(`/barcode/${code}`);
      if (data.product?.name) {
        setItemForm((f) => ({ ...f, name: data.product.name, barcode: code, category: data.product.category || '' }));
        setShowAddItem(true);
      }
    } catch {
      setItemForm((f) => ({ ...f, barcode: code }));
      setShowAddItem(true);
    }
  }, []);

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  return (
    <div className="space-y-4 max-w-3xl">
      <BarcodeInput onScan={handleBarcodeScan} />

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Einkaufslisten</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowAddList(true)} className="btn-secondary flex items-center gap-1 text-sm">
            <Plus className="w-4 h-4" /> Liste
          </button>
          {activeListId && (
            <button onClick={() => setShowAddItem(true)} className="btn-primary flex items-center gap-1 text-sm">
              <Plus className="w-4 h-4" /> Artikel
            </button>
          )}
        </div>
      </div>

      {lists.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {lists.map((list) => (
            <div key={list.id} className="flex items-center shrink-0">
              <button onClick={() => setActiveListId(list.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeListId === list.id
                    ? 'bg-primary-500 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {list.isDefault && <Pin className="w-3 h-3" />}
                {list.name}
                <span className={`text-xs ${activeListId === list.id ? 'text-primary-200' : 'text-gray-400'}`}>
                  ({list._count.items})
                </span>
              </button>
              {activeListId === list.id && (
                <>
                  {!list.isDefault && (
                    <button onClick={() => makeDefault.mutate(list.id)}
                      title="Als Standard für Auto-Add festlegen"
                      className="ml-1 p-1 text-gray-300 hover:text-primary-500">
                      <Pin className="w-3 h-3" />
                    </button>
                  )}
                  <button onClick={() => { if (confirm('Liste löschen?')) deleteList.mutate(list.id); }}
                    className="ml-1 p-1 text-gray-300 hover:text-red-400">
                    <X className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
        <Barcode className="w-4 h-4 shrink-0" />
        <span className="flex-1">Barcode-Scanner anschließen oder Kamera nutzen</span>
        <button onClick={() => setShowScanner(true)} className="flex items-center gap-1 text-primary-600 hover:underline font-medium">
          <Camera className="w-3.5 h-3.5" /> Scannen
        </button>
      </div>

      <CameraScanner open={showScanner} onClose={() => setShowScanner(false)} onScan={handleBarcodeScan} />

      {activeListId ? (
        <div className="card">
          {items.length === 0 ? (
            <div className="p-8 text-center">
              <ShoppingCart className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">Liste ist leer</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {unchecked.map((item) => (
                <ItemRow key={item.id} item={item}
                  onToggle={(c) => toggleItem.mutate({ id: item.id, checked: c })}
                  onDelete={() => deleteItem.mutate(item.id)} />
              ))}
              {checked.length > 0 && (
                <>
                  <li className="px-4 py-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-400">Erledigt ({checked.length})</span>
                    <div className="flex items-center gap-3">
                      <button onClick={openToPantry} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                        <Package className="w-3 h-3" /> In Vorrat
                      </button>
                      <button onClick={() => clearChecked.mutate()} className="text-xs text-red-400 hover:text-red-600">Löschen</button>
                    </div>
                  </li>
                  {checked.map((item) => (
                    <ItemRow key={item.id} item={item}
                      onToggle={(c) => toggleItem.mutate({ id: item.id, checked: c })}
                      onDelete={() => deleteItem.mutate(item.id)} />
                  ))}
                </>
              )}
            </ul>
          )}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <p className="text-gray-400 text-sm">Keine Liste ausgewählt</p>
        </div>
      )}

      <Modal open={showAddList} onClose={() => setShowAddList(false)} title="Neue Einkaufsliste" size="sm">
        <form onSubmit={(e) => { e.preventDefault(); createList.mutate(newListName); }} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" placeholder="z.B. Wocheneinkauf" value={newListName}
              onChange={(e) => setNewListName(e.target.value)} required autoFocus />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAddList(false)} className="btn-secondary">Abbrechen</button>
            <button type="submit" className="btn-primary">Erstellen</button>
          </div>
        </form>
      </Modal>

      <Modal open={showAddItem} onClose={() => setShowAddItem(false)} title="Artikel hinzufügen" size="sm">
        <form onSubmit={(e) => { e.preventDefault(); addItem.mutate(itemForm); }} className="space-y-3">
          <div>
            <label className="label">Artikel</label>
            <ProductAutocomplete
              value={itemForm.name}
              placeholder="z.B. Vollmilch"
              required autoFocus
              onChange={(name) => setItemForm({ ...itemForm, name })}
              onSelect={(s) => setItemForm({
                ...itemForm,
                name: s.name,
                unit: s.unit || itemForm.unit,
                category: s.category || itemForm.category,
                barcode: s.barcode || itemForm.barcode,
              })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Menge</label>
              <input type="number" min="0.1" step="0.1" className="input" value={itemForm.quantity}
                onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} />
            </div>
            <div>
              <label className="label">Einheit</label>
              <select className="input" value={itemForm.unit}
                onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}>
                {['Stück', 'g', 'kg', 'ml', 'L', 'Packung', 'Dose', 'Flasche'].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Kategorie (optional)</label>
            <input className="input" placeholder="z.B. Milchprodukte" value={itemForm.category}
              onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} />
          </div>
          <div>
            <label className="label">Notiz (optional)</label>
            <input className="input" placeholder="z.B. Bio, falls vorhanden" value={itemForm.note}
              onChange={(e) => setItemForm({ ...itemForm, note: e.target.value })} />
          </div>
          {itemForm.barcode && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Barcode className="w-3 h-3" /> Barcode: {itemForm.barcode}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowAddItem(false)} className="btn-secondary">Abbrechen</button>
            <button type="submit" disabled={addItem.isPending} className="btn-primary">Hinzufügen</button>
          </div>
        </form>
      </Modal>

      <Modal open={showToPantry} onClose={() => setShowToPantry(false)} title="In Vorrat übernehmen">
        {toPantryDraft.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Keine erledigten Artikel.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {toPantryDraft.map((row, idx) => (
              <div key={row.shoppingItemId}
                className={`rounded-lg border px-3 py-2 ${row.include ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <input type="checkbox" checked={row.include}
                    onChange={(e) => setToPantryDraft(toPantryDraft.map((r, i) => i === idx ? { ...r, include: e.target.checked } : r))} />
                  <span className="font-medium text-sm flex-1">{row.name}</span>
                </div>
                {row.include && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-1">
                      <span className="text-gray-400 w-14">Menge</span>
                      <input type="number" min="0" step="0.1" className="input flex-1 py-1" value={row.quantity}
                        onChange={(e) => setToPantryDraft(toPantryDraft.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r))} />
                      <span className="text-gray-400">{row.unit}</span>
                    </label>
                    <label className="flex items-center gap-1">
                      <span className="text-gray-400 w-14">Ort</span>
                      <select className="input flex-1 py-1" value={row.location}
                        onChange={(e) => setToPantryDraft(toPantryDraft.map((r, i) => i === idx ? { ...r, location: e.target.value } : r))}>
                        {['Kühlschrank', 'Tiefkühl', 'Vorratskammer', 'Keller', 'Sonstiges'].map((l) => <option key={l}>{l}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-1 col-span-2">
                      <span className="text-gray-400 w-14">Ablauf</span>
                      <input type="date" className="input flex-1 py-1" value={row.expiryDate}
                        onChange={(e) => setToPantryDraft(toPantryDraft.map((r, i) => i === idx ? { ...r, expiryDate: e.target.value } : r))} />
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-3">
          <button onClick={() => setShowToPantry(false)} className="btn-secondary">Abbrechen</button>
          <button
            disabled={toPantry.isPending || toPantryDraft.filter((r) => r.include).length === 0}
            onClick={() => toPantry.mutate({
              items: toPantryDraft.filter((r) => r.include).map((r) => ({
                shoppingItemId: r.shoppingItemId,
                name: r.name,
                quantity: Number(r.quantity) || 0,
                unit: r.unit,
                location: r.location || undefined,
                category: r.category || undefined,
                expiryDate: r.expiryDate || null,
              })),
            })}
            className="btn-primary">
            {toPantry.isPending ? 'Übernehme…' : 'Übernehmen'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
