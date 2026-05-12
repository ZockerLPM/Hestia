import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Trash2, Plus, RefreshCw } from 'lucide-react';
import { api } from '../api/client';

interface ShiftPattern {
  id: string;
  weekday: number;   // 0=Mo … 6=So
  startsAt: string;  // "HH:MM"
  endsAt: string;
  validFrom: string;
  validUntil: string | null;
  note: string | null;
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const EMPTY: Omit<ShiftPattern, 'id' | 'validFrom' | 'validUntil'> = {
  weekday: 0,
  startsAt: '08:00',
  endsAt: '17:00',
  note: null,
};

export default function ShiftPatternEditor() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY, weekday: 0, note: '' });
  const [adding, setAdding] = useState(false);

  const { data: patterns = [] } = useQuery<ShiftPattern[]>({
    queryKey: ['shift-patterns'],
    queryFn: () => api.get('/shifts/patterns').then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: (data: typeof form) =>
      api.post('/shifts/patterns', {
        ...data,
        note: data.note.trim() || null,
        validFrom: new Date().toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-patterns'] });
      setAdding(false);
      setForm({ ...EMPTY, weekday: 0, note: '' });
      toast.success('Muster gespeichert');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/shifts/patterns/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-patterns'] });
      toast.success('Muster gelöscht');
    },
  });

  const generate = useMutation({
    mutationFn: () => api.post('/shifts/patterns/generate'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['shifts'] });
      toast.success(`${res.data.created} Schicht${res.data.created !== 1 ? 'en' : ''} generiert`);
    },
  });

  // Muster gruppiert nach Wochentag
  const byDay = Array.from({ length: 7 }, (_, i) =>
    patterns.filter((p) => p.weekday === i)
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Schicht-Muster</h3>
        <div className="flex gap-2">
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            title="Schichten für nächste 14 Tage generieren"
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" /> Generieren
          </button>
          <button
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white"
          >
            <Plus className="w-4 h-4" /> Muster
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Muster werden täglich um 03:00 Uhr automatisch in konkrete Schichten umgewandelt (14-Tage-Horizont).
      </p>

      {/* Wochenansicht */}
      <div className="grid grid-cols-7 gap-1 mb-4">
        {WEEKDAYS.map((day, i) => (
          <div key={day} className="text-center">
            <div className={`text-xs font-medium mb-1 ${i < 5 ? 'text-gray-700 dark:text-gray-300' : 'text-amber-500'}`}>
              {day}
            </div>
            <div className="space-y-1 min-h-[40px]">
              {byDay[i].map((p) => (
                <div
                  key={p.id}
                  className="group relative bg-primary-100 dark:bg-primary-900/40 rounded px-1 py-0.5 text-xs text-primary-800 dark:text-primary-200"
                  title={p.note ?? `${p.startsAt}–${p.endsAt}`}
                >
                  <div className="truncate">{p.startsAt}</div>
                  <div className="truncate text-gray-500">–{p.endsAt}</div>
                  <button
                    onClick={() => remove.mutate(p.id)}
                    className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 bg-red-500 text-white rounded-full items-center justify-center"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Formular */}
      {adding && (
        <form
          onSubmit={(e) => { e.preventDefault(); create.mutate(form); }}
          className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3"
        >
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((day, i) => (
              <button
                key={day}
                type="button"
                onClick={() => setForm((f) => ({ ...f, weekday: i }))}
                className={`py-1.5 rounded text-sm font-medium transition-colors ${
                  form.weekday === i
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <label className="flex-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Von</span>
              <input
                type="time"
                value={form.startsAt}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                className="mt-0.5 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </label>
            <label className="flex-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Bis</span>
              <input
                type="time"
                value={form.endsAt}
                onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                className="mt-0.5 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </label>
          </div>
          <input
            type="text"
            placeholder="Notiz (optional)"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="px-4 py-1.5 text-sm rounded-lg bg-primary-500 hover:bg-primary-600 text-white disabled:opacity-50"
            >
              Speichern
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
