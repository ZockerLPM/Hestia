import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Plus, Trash2, Edit2, TrendingUp, TrendingDown, Target, ScanLine, Repeat, Play, Pause } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Modal from '../components/ui/Modal';
import type { FinanceEntry, FinanceCategory, FinanceSummary, Budget, RecurringFinance } from '../api/types';

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const emptyForm = (now: Date) => ({
  type: 'expense', amount: '', description: '', date: format(now, 'yyyy-MM-dd'), categoryId: '',
});

export default function Finance() {
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm(now));
  const [showBudgets, setShowBudgets] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [editRecurringId, setEditRecurringId] = useState<string | null>(null);
  const [recurringForm, setRecurringForm] = useState({
    type: 'expense', amount: '', description: '', categoryId: '',
    interval: 'monthly', dayOfMonth: '1',
    startDate: format(now, 'yyyy-MM-dd'), endDate: '', autoCreate: true,
  });
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  const handleScanReceipt = async (file: File) => {
    setScanning(true);
    setScanProgress(0);
    const toastId = toast.loading('Beleg wird analysiert…');
    try {
      const { scanReceipt } = await import('../lib/receiptParser');
      const result = await scanReceipt(file, (p) => setScanProgress(p));
      const updates: Partial<typeof form> = { type: 'expense' };
      if (result.amount) updates.amount = result.amount.toFixed(2);
      if (result.date) updates.date = result.date;
      if (result.merchant) updates.description = result.merchant;
      setForm((f) => ({ ...f, ...updates }));
      setEditId(null);
      setShowModal(true);
      toast.success('Werte übernommen — bitte prüfen', { id: toastId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Beleg konnte nicht gelesen werden', { id: toastId });
    } finally {
      setScanning(false);
    }
  };

  const { data: categories = [] } = useQuery<FinanceCategory[]>({
    queryKey: ['finance-categories'],
    queryFn: () => api.get('/finance/categories').then((r) => r.data),
  });

  const { data: entries = [] } = useQuery<FinanceEntry[]>({
    queryKey: ['finance-entries', month, year],
    queryFn: () => api.get(`/finance/entries?month=${month}&year=${year}`).then((r) => r.data),
  });

  const { data: summary } = useQuery<FinanceSummary>({
    queryKey: ['finance-summary', year],
    queryFn: () => api.get(`/finance/summary?year=${year}`).then((r) => r.data),
  });

  const { data: budgets = [] } = useQuery<Budget[]>({
    queryKey: ['finance-budgets', month, year],
    queryFn: () => api.get(`/finance/budgets?month=${month}&year=${year}`).then((r) => r.data),
  });

  const { data: recurring = [] } = useQuery<RecurringFinance[]>({
    queryKey: ['finance-recurring'],
    queryFn: () => api.get('/finance/recurring').then((r) => r.data),
  });

  const saveRecurring = useMutation({
    mutationFn: () => {
      const payload = {
        ...recurringForm,
        amount: Number(recurringForm.amount),
        dayOfMonth: recurringForm.interval === 'weekly' ? null : Number(recurringForm.dayOfMonth) || null,
        endDate: recurringForm.endDate || null,
      };
      return editRecurringId
        ? api.put(`/finance/recurring/${editRecurringId}`, payload)
        : api.post('/finance/recurring', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-recurring'] });
      toast.success(editRecurringId ? 'Vorlage aktualisiert' : 'Vorlage angelegt');
      setShowRecurring(false);
      setEditRecurringId(null);
    },
  });

  const deleteRecurring = useMutation({
    mutationFn: (id: string) => api.delete(`/finance/recurring/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-recurring'] });
      toast.success('Vorlage gelöscht');
    },
  });

  const toggleRecurring = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.put(`/finance/recurring/${id}`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance-recurring'] }),
  });

  const applyRecurring = useMutation({
    mutationFn: (id: string) => api.post(`/finance/recurring/${id}/apply`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-entries'] });
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
      qc.invalidateQueries({ queryKey: ['finance-recurring'] });
      toast.success('Eintrag erstellt');
    },
  });

  const openNewRecurring = () => {
    setEditRecurringId(null);
    setRecurringForm({
      type: 'expense', amount: '', description: '',
      categoryId: categories.find((c) => c.type !== 'income')?.id ?? '',
      interval: 'monthly', dayOfMonth: '1',
      startDate: format(now, 'yyyy-MM-dd'), endDate: '', autoCreate: true,
    });
    setShowRecurring(true);
  };

  const openEditRecurring = (r: RecurringFinance) => {
    setEditRecurringId(r.id);
    setRecurringForm({
      type: r.type,
      amount: String(r.amount),
      description: r.description,
      categoryId: r.categoryId,
      interval: r.interval,
      dayOfMonth: r.dayOfMonth != null ? String(r.dayOfMonth) : '1',
      startDate: format(new Date(r.startDate), 'yyyy-MM-dd'),
      endDate: r.endDate ? format(new Date(r.endDate), 'yyyy-MM-dd') : '',
      autoCreate: r.autoCreate,
    });
    setShowRecurring(true);
  };

  const updateCategoryBudget = useMutation({
    mutationFn: ({ id, monthlyBudget }: { id: string; monthlyBudget: number | null }) =>
      api.put(`/finance/categories/${id}`, { monthlyBudget }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-categories'] });
      qc.invalidateQueries({ queryKey: ['finance-budgets'] });
      toast.success('Budget aktualisiert');
    },
  });

  const saveEntry = useMutation({
    mutationFn: (data: typeof form) =>
      editId ? api.put(`/finance/entries/${editId}`, data) : api.post('/finance/entries', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-entries'] });
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
      toast.success(editId ? 'Eintrag aktualisiert' : 'Eintrag erstellt');
      setShowModal(false);
      setEditId(null);
      setForm(emptyForm(now));
    },
  });

  const deleteEntry = useMutation({
    mutationFn: (id: string) => api.delete(`/finance/entries/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-entries'] });
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
      toast.success('Eintrag gelöscht');
    },
  });

  const openEdit = (entry: FinanceEntry) => {
    setEditId(entry.id);
    setForm({
      type: entry.type,
      amount: String(entry.amount),
      description: entry.description,
      date: format(new Date(entry.date), 'yyyy-MM-dd'),
      categoryId: entry.category.id,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditId(null);
    setForm(emptyForm(now));
  };

  const income = entries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const expenses = entries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  const filteredCategories = categories.filter((c) => c.type === form.type || c.type === 'both');

  const chartData = summary?.monthlyData.map((d) => ({
    name: MONTHS[d.month - 1],
    Einnahmen: d.income,
    Ausgaben: d.expenses,
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Finanzen</h1>
        <div className="flex items-center gap-2">
          <select className="input w-auto" value={month} onChange={(e) => setMonth(+e.target.value)}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select className="input w-auto" value={year} onChange={(e) => setYear(+e.target.value)}>
            {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <label className="btn-secondary flex items-center gap-2 cursor-pointer">
            <ScanLine className="w-4 h-4" />
            {scanning ? `Beleg ${Math.round(scanProgress * 100)}%` : 'Beleg'}
            <input type="file" accept="image/*" capture="environment" className="hidden"
              disabled={scanning}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleScanReceipt(f); e.target.value = ''; }} />
          </label>
          <button onClick={() => setShowBudgets(true)} className="btn-secondary flex items-center gap-2">
            <Target className="w-4 h-4" /> Budgets
          </button>
          <button onClick={openNewRecurring} className="btn-secondary flex items-center gap-2">
            <Repeat className="w-4 h-4" /> Wiederkehrend
          </button>
          <button onClick={() => { setEditId(null); setForm(emptyForm(now)); setShowModal(true); }}
            className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Eintrag
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <TrendingUp className="w-5 h-5 text-green-500 mx-auto mb-1" />
          <p className="text-xs text-gray-500">Einnahmen</p>
          <p className="text-xl font-bold text-green-600">{income.toFixed(2)} €</p>
        </div>
        <div className="card p-4 text-center">
          <TrendingDown className="w-5 h-5 text-red-500 mx-auto mb-1" />
          <p className="text-xs text-gray-500">Ausgaben</p>
          <p className="text-xl font-bold text-red-500">{expenses.toFixed(2)} €</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-500 mt-6">Saldo</p>
          <p className={`text-xl font-bold ${income - expenses >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {(income - expenses).toFixed(2)} €
          </p>
        </div>
      </div>

      {budgets.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-primary-500" /> Budgets — {MONTHS[month - 1]}
            </h2>
            <button onClick={() => setShowBudgets(true)} className="text-xs text-primary-600 hover:underline">
              Anpassen
            </button>
          </div>
          <div className="space-y-3">
            {budgets.map((b) => {
              const pct = Math.min(b.percent, 1.2);
              const over = b.percent >= 1;
              const warn = b.percent >= 0.8 && !over;
              const barColor = over ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-green-500';
              return (
                <div key={b.categoryId}>
                  <div className="flex items-baseline justify-between text-xs mb-1">
                    <span className="font-medium">
                      <span className="mr-1">{b.categoryIcon}</span>{b.categoryName}
                    </span>
                    <span className={over ? 'text-red-600 font-semibold' : warn ? 'text-amber-700' : 'text-gray-500'}>
                      {b.spent.toFixed(2)} € / {b.limit.toFixed(2)} € ({Math.round(b.percent * 100)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {recurring.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Repeat className="w-4 h-4 text-primary-500" /> Wiederkehrende Ausgaben
            </h2>
            <button onClick={openNewRecurring} className="text-xs text-primary-600 hover:underline">
              + Hinzufügen
            </button>
          </div>
          <ul className="divide-y divide-gray-50">
            {recurring.map((r) => (
              <li key={r.id} className={`flex items-center gap-3 py-2.5 ${!r.active ? 'opacity-50' : ''}`}>
                <span className="text-lg">{r.category?.icon ?? '💸'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.description}</p>
                  <p className="text-xs text-gray-400">
                    {r.category?.name ?? '—'} ·{' '}
                    {r.interval === 'weekly' ? 'wöchentlich' : r.interval === 'monthly' ? 'monatlich' : 'jährlich'}
                    {r.dayOfMonth ? ` am ${r.dayOfMonth}.` : ''}
                    {' '}· nächste: {format(new Date(r.nextRunAt), 'd. MMM', { locale: de })}
                  </p>
                </div>
                <span className={`font-semibold text-sm ${r.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                  {r.type === 'income' ? '+' : '-'}{r.amount.toFixed(2)} €
                </span>
                <button onClick={() => applyRecurring.mutate(r.id)}
                  title="Jetzt erzeugen"
                  className="p-1.5 text-gray-300 hover:text-primary-500">
                  <Play className="w-4 h-4" />
                </button>
                <button onClick={() => toggleRecurring.mutate({ id: r.id, active: !r.active })}
                  title={r.active ? 'Pausieren' : 'Aktivieren'}
                  className="p-1.5 text-gray-300 hover:text-amber-500">
                  {r.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button onClick={() => openEditRecurring(r)} className="p-1.5 text-gray-300 hover:text-primary-500">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => { if (confirm('Vorlage löschen?')) deleteRecurring.mutate(r.id); }}
                  className="p-1.5 text-gray-300 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {chartData && (
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Jahresverlauf {year}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={2}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}€`} />
              <Tooltip formatter={(v: number) => `${v.toFixed(2)} €`} />
              <Legend />
              <Bar dataKey="Einnahmen" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Ausgaben" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold">Einträge — {MONTHS[month - 1]} {year}</h2>
        </div>
        {entries.length === 0 ? (
          <p className="p-6 text-center text-gray-400 text-sm">Keine Einträge in diesem Monat</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-lg">{entry.category.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entry.description}</p>
                  <p className="text-xs text-gray-400">
                    {entry.category.name} · {format(new Date(entry.date), 'd. MMM', { locale: de })} · {entry.user.name}
                  </p>
                </div>
                <span className={`font-semibold text-sm ${entry.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                  {entry.type === 'income' ? '+' : '-'}{entry.amount.toFixed(2)} €
                </span>
                <button onClick={() => openEdit(entry)}
                  className="p-1.5 text-gray-300 hover:text-primary-500 transition-colors">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => { if (confirm('Eintrag löschen?')) deleteEntry.mutate(entry.id); }}
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={showModal} onClose={closeModal} title={editId ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}>
        <form onSubmit={(e) => { e.preventDefault(); saveEntry.mutate(form); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(['expense', 'income'] as const).map((t) => (
              <button key={t} type="button"
                onClick={() => setForm({ ...form, type: t, categoryId: '' })}
                className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                  form.type === t
                    ? t === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                {t === 'income' ? '📈 Einnahme' : '📉 Ausgabe'}
              </button>
            ))}
          </div>
          <div>
            <label className="label">Betrag (€)</label>
            <input type="number" step="0.01" min="0" className="input" placeholder="0,00"
              value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </div>
          <div>
            <label className="label">Beschreibung</label>
            <input className="input" placeholder="z.B. Wocheneinkauf"
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </div>
          <div>
            <label className="label">Kategorie</label>
            <select className="input" value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
              <option value="">Kategorie wählen…</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Datum</label>
            <input type="date" className="input"
              value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeModal} className="btn-secondary">Abbrechen</button>
            <button type="submit" disabled={saveEntry.isPending} className="btn-primary">
              {saveEntry.isPending ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={showBudgets} onClose={() => setShowBudgets(false)} title="Monatsbudgets">
        <div className="space-y-2">
          <p className="text-xs text-gray-400 mb-2">Setze ein monatliches Limit pro Ausgabe-Kategorie. Leer lassen = kein Limit.</p>
          {categories
            .filter((c) => c.type !== 'income')
            .map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="text-lg w-6 text-center">{c.icon}</span>
                <span className="flex-1 text-sm">{c.name}</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input w-28 text-right"
                  placeholder="—"
                  defaultValue={c.monthlyBudget ?? ''}
                  onBlur={(e) => {
                    const next = e.target.value === '' ? null : Number(e.target.value);
                    const prev = c.monthlyBudget;
                    if (next !== prev) updateCategoryBudget.mutate({ id: c.id, monthlyBudget: next });
                  }}
                />
                <span className="text-xs text-gray-400">€</span>
              </div>
            ))}
        </div>
      </Modal>

      <Modal open={showRecurring} onClose={() => { setShowRecurring(false); setEditRecurringId(null); }}
        title={editRecurringId ? 'Vorlage bearbeiten' : 'Neue wiederkehrende Ausgabe'}>
        <form onSubmit={(e) => { e.preventDefault(); saveRecurring.mutate(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(['expense', 'income'] as const).map((t) => (
              <button key={t} type="button"
                onClick={() => setRecurringForm({ ...recurringForm, type: t, categoryId: '' })}
                className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                  recurringForm.type === t
                    ? t === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                {t === 'income' ? '📈 Einnahme' : '📉 Ausgabe'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Betrag (€)</label>
              <input type="number" step="0.01" min="0" className="input" required
                value={recurringForm.amount}
                onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })} />
            </div>
            <div>
              <label className="label">Intervall</label>
              <select className="input" value={recurringForm.interval}
                onChange={(e) => setRecurringForm({ ...recurringForm, interval: e.target.value })}>
                <option value="weekly">Wöchentlich</option>
                <option value="monthly">Monatlich</option>
                <option value="yearly">Jährlich</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Beschreibung</label>
            <input className="input" required placeholder="z.B. Miete"
              value={recurringForm.description}
              onChange={(e) => setRecurringForm({ ...recurringForm, description: e.target.value })} />
          </div>
          <div>
            <label className="label">Kategorie</label>
            <select className="input" required value={recurringForm.categoryId}
              onChange={(e) => setRecurringForm({ ...recurringForm, categoryId: e.target.value })}>
              <option value="">Wählen…</option>
              {categories.filter((c) => c.type === recurringForm.type || c.type === 'both').map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">Start</label>
              <input type="date" className="input" required value={recurringForm.startDate}
                onChange={(e) => setRecurringForm({ ...recurringForm, startDate: e.target.value })} />
            </div>
            <div>
              <label className="label">Ende (optional)</label>
              <input type="date" className="input" value={recurringForm.endDate}
                onChange={(e) => setRecurringForm({ ...recurringForm, endDate: e.target.value })} />
            </div>
            {recurringForm.interval !== 'weekly' && (
              <div>
                <label className="label">Tag im Monat</label>
                <input type="number" min="1" max="28" className="input" value={recurringForm.dayOfMonth}
                  onChange={(e) => setRecurringForm({ ...recurringForm, dayOfMonth: e.target.value })} />
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={recurringForm.autoCreate}
              onChange={(e) => setRecurringForm({ ...recurringForm, autoCreate: e.target.checked })} />
            Automatisch erzeugen (sonst nur als Vorlage)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setShowRecurring(false); setEditRecurringId(null); }} className="btn-secondary">Abbrechen</button>
            <button type="submit" disabled={saveRecurring.isPending} className="btn-primary">
              {saveRecurring.isPending ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
