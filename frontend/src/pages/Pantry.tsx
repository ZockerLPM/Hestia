import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { differenceInDays } from 'date-fns';
import { Plus, Search, Trash2, Edit2, AlertTriangle, Barcode, Camera, CheckSquare, Square } from 'lucide-react';
import Modal from '../components/ui/Modal';
import CameraScanner from '../components/CameraScanner';
import ProductAutocomplete from '../components/ProductAutocomplete';
import type { PantryItem } from '../api/types';

const LOCATIONS = ['Kühlschrank', 'Tiefkühl', 'Vorratskammer', 'Keller', 'Sonstiges'];
const UNITS = ['Stück', 'g', 'kg', 'ml', 'L', 'Packung', 'Dose', 'Flasche', 'Glas'];

function ExpiryBadge({ date }: { date: string }) {
  const days = differenceInDays(new Date(date), new Date());
  const color = days < 0 ? 'bg-red-100 text-red-700' : days <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      {days < 0 ? `${Math.abs(days)}d abgelaufen` : days === 0 ? 'heute' : `${days}d`}
    </span>
  );
}

const emptyForm = {
  name: '', quantity: '1', unit: 'Stück', barcode: '', expiryDate: '',
  category: '', location: 'Vorratskammer', minQuantity: '',
};

export default function Pantry() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [editItem, setEditItem] = useState<PantryItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastKeyTime = useRef(0);
  const barcodeBuffer = useRef('');

  const { data: items = [] } = useQuery<PantryItem[]>({
    queryKey: ['pantry-items', search, locationFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (locationFilter) params.set('location', locationFilter);
      return api.get(`/pantry/items?${params}`).then((r) => r.data);
    },
  });

  const save = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = { ...data, quantity: parseFloat(data.quantity), minQuantity: data.minQuantity ? parseFloat(data.minQuantity) : undefined };
      return editItem ? api.put(`/pantry/items/${editItem.id}`, payload) : api.post('/pantry/items', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pantry-items'] });
      qc.invalidateQueries({ queryKey: ['pantry-low-stock'] });
      qc.invalidateQueries({ queryKey: ['pantry-expiring'] });
      toast.success(editItem ? 'Artikel aktualisiert' : 'Artikel hinzugefügt');
      setShowModal(false);
      setEditItem(null);
      setForm(emptyForm);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/pantry/items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pantry-items'] });
      qc.invalidateQueries({ queryKey: ['pantry-low-stock'] });
      toast.success('Artikel gelöscht');
    },
  });

  const bulk = useMutation({
    mutationFn: (body: { ids: string[]; action: string; payload?: Record<string, unknown> }) =>
      api.post('/pantry/bulk', body),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['pantry-items'] });
      qc.invalidateQueries({ queryKey: ['pantry-low-stock'] });
      qc.invalidateQueries({ queryKey: ['pantry-expiring'] });
      toast.success(`${res.data.affected} Artikel ${vars.action === 'delete' ? 'gelöscht' : 'aktualisiert'}`);
      setSelectedIds(new Set());
      setSelectMode(false);
    },
  });

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const openEdit = (item: PantryItem) => {
    setEditItem(item);
    setForm({
      name: item.name, quantity: String(item.quantity), unit: item.unit,
      barcode: item.barcode || '', expiryDate: item.expiryDate ? item.expiryDate.slice(0, 10) : '',
      category: item.category || '', location: item.location || 'Vorratskammer',
      minQuantity: item.minQuantity ? String(item.minQuantity) : '',
    });
    setShowModal(true);
  };

  const handleBarcodeScan = useCallback(async (code: string) => {
    try {
      const { data } = await api.get(`/barcode/${code}`);
      if (data.product?.name) {
        setForm((f) => ({ ...f, name: data.product.name, barcode: code, category: data.product.category || '' }));
      } else {
        setForm((f) => ({ ...f, barcode: code }));
      }
    } catch {
      setForm((f) => ({ ...f, barcode: code }));
    }
    setShowModal(true);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
  }, [handleBarcodeScan]);

  const grouped = items.reduce<Record<string, PantryItem[]>>((acc, item) => {
    const key = item.location || 'Sonstiges';
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Vorratsverwaltung</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setSelectMode((m) => !m); setSelectedIds(new Set()); }}
            className={`btn-secondary flex items-center gap-2 ${selectMode ? 'bg-primary-50 text-primary-600' : ''}`}>
            <CheckSquare className="w-4 h-4" /> {selectMode ? 'Fertig' : 'Auswählen'}
          </button>
          <button onClick={() => { setEditItem(null); setForm(emptyForm); setShowModal(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Hinzufügen
          </button>
        </div>
      </div>

      {selectMode && selectedIds.size > 0 && (
        <div className="card flex flex-wrap items-center gap-2 px-3 py-2 bg-primary-50 border-primary-200">
          <span className="text-sm font-medium text-primary-700">{selectedIds.size} ausgewählt</span>
          <select
            className="input w-auto text-xs py-1"
            onChange={(e) => {
              if (!e.target.value) return;
              bulk.mutate({ ids: [...selectedIds], action: 'location', payload: { location: e.target.value } });
              e.target.value = '';
            }}
            defaultValue=""
          >
            <option value="">Standort ändern…</option>
            {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <button onClick={() => {
            const cat = prompt('Neue Kategorie (leer = entfernen)');
            if (cat === null) return;
            bulk.mutate({ ids: [...selectedIds], action: 'category', payload: { category: cat } });
          }} className="text-xs px-2 py-1 bg-white rounded border border-gray-200 hover:bg-gray-50">
            Kategorie
          </button>
          <button onClick={() => {
            if (!confirm(`${selectedIds.size} Artikel wirklich löschen?`)) return;
            bulk.mutate({ ids: [...selectedIds], action: 'delete' });
          }} className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded border border-red-200 hover:bg-red-100">
            Löschen
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Suchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
          <option value="">Alle Orte</option>
          {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
        <Barcode className="w-4 h-4 shrink-0" />
        <span className="flex-1">Barcode-Scanner anschließen oder Kamera nutzen</span>
        <button onClick={() => setShowScanner(true)} className="flex items-center gap-1 text-primary-600 hover:underline font-medium">
          <Camera className="w-3.5 h-3.5" /> Scannen
        </button>
      </div>

      <CameraScanner open={showScanner} onClose={() => setShowScanner(false)} onScan={handleBarcodeScan} />

      {Object.entries(grouped).map(([location, locationItems]) => (
        <div key={location} className="card">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="font-semibold text-sm">{location}</span>
            <span className="text-xs text-gray-400">({locationItems.length})</span>
          </div>
          <ul className="divide-y divide-gray-50">
            {locationItems.map((item) => {
              const isLow = item.minQuantity !== null && item.minQuantity !== undefined && item.quantity <= item.minQuantity;
              return (
                <li key={item.id}
                  className={`flex items-center gap-3 px-4 py-3 ${selectedIds.has(item.id) ? 'bg-primary-50' : ''}`}>
                  {selectMode && (
                    <button onClick={() => toggleSelect(item.id)} className="shrink-0 text-primary-500">
                      {selectedIds.has(item.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                  )}
                  {isLow && (
                    <span title="Unter Mindestbestand">
                      <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-gray-400">
                      {item.quantity} {item.unit}
                      {item.category && ` · ${item.category}`}
                      {item.minQuantity && ` · Min: ${item.minQuantity} ${item.unit}`}
                    </p>
                  </div>
                  {item.expiryDate && <ExpiryBadge date={item.expiryDate} />}
                  <button onClick={() => openEdit(item)} className="p-1.5 text-gray-300 hover:text-primary-500 transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => { if (confirm(`"${item.name}" löschen?`)) remove.mutate(item.id); }}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {items.length === 0 && (
        <div className="card p-10 text-center text-gray-400 text-sm">
          Noch keine Vorräte eingetragen.
        </div>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditItem(null); setForm(emptyForm); }}
        title={editItem ? 'Artikel bearbeiten' : 'Neuer Vorrat'}>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="space-y-3">
          <div>
            <label className="label">Name</label>
            <ProductAutocomplete
              value={form.name}
              placeholder="z.B. Mehl"
              required autoFocus
              onChange={(name) => setForm({ ...form, name })}
              onSelect={(s) => setForm({
                ...form,
                name: s.name,
                unit: s.unit || form.unit,
                category: s.category || form.category,
                location: s.location || form.location,
                barcode: s.barcode || form.barcode,
              })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Menge</label>
              <input type="number" min="0" step="0.01" className="input" value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            </div>
            <div>
              <label className="label">Einheit</label>
              <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Standort</label>
              <select className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
                {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Kategorie</label>
              <input className="input" placeholder="z.B. Milchprodukte" value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Mindestbestand</label>
              <input type="number" min="0" step="0.01" className="input" placeholder="optional" value={form.minQuantity}
                onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} />
            </div>
            <div>
              <label className="label">Ablaufdatum</label>
              <input type="date" className="input" value={form.expiryDate}
                onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Barcode (optional)</label>
            <input className="input" placeholder="z.B. 4000417025005" value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setShowModal(false); setEditItem(null); }} className="btn-secondary">Abbrechen</button>
            <button type="submit" disabled={save.isPending} className="btn-primary">
              {save.isPending ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
