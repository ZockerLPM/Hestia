import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, isSameMonth, isSameDay, isToday,
  eachDayOfInterval, parseISO,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { Plus, ChevronLeft, ChevronRight, Trash2, Edit2, Repeat } from 'lucide-react';
import Modal from '../components/ui/Modal';
import type { CalendarEvent } from '../api/types';

const EVENT_COLORS = ['#6366f1', '#ec4899', '#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'];
const RECURRENCE = [
  { value: '', label: 'Einmalig' },
  { value: 'daily', label: 'Täglich' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'monthly', label: 'Monatlich' },
  { value: 'yearly', label: 'Jährlich' },
];
const emptyForm = {
  title: '', description: '', startDate: '', endDate: '', allDay: true, color: '#6366f1',
  recurrence: '', recurrenceUntil: '',
};

export default function Calendar() {
  const qc = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState(emptyForm);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar-events', format(monthStart, 'yyyy-MM')],
    queryFn: () =>
      api.get(`/calendar/events?start=${calStart.toISOString()}&end=${calEnd.toISOString()}`).then((r) => r.data),
  });

  const save = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = {
        ...data,
        endDate: data.allDay && !data.endDate ? data.startDate : data.endDate || data.startDate,
      };
      return editEvent
        ? api.put(`/calendar/events/${editEvent.id}`, payload)
        : api.post('/calendar/events', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(editEvent ? 'Termin aktualisiert' : 'Termin erstellt');
      setShowModal(false);
      setEditEvent(null);
      setForm(emptyForm);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/calendar/events/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success('Termin gelöscht');
    },
  });

  const openNewEvent = (day?: Date) => {
    const d = day || new Date();
    setEditEvent(null);
    setForm({ ...emptyForm, startDate: format(d, 'yyyy-MM-dd'), endDate: format(d, 'yyyy-MM-dd') });
    setShowModal(true);
  };

  const openEditEvent = (event: CalendarEvent) => {
    setEditEvent(event);
    setForm({
      title: event.title,
      description: event.description || '',
      startDate: event.allDay
        ? format(parseISO(event.startDate), 'yyyy-MM-dd')
        : format(parseISO(event.startDate), "yyyy-MM-dd'T'HH:mm"),
      endDate: event.allDay
        ? format(parseISO(event.endDate), 'yyyy-MM-dd')
        : format(parseISO(event.endDate), "yyyy-MM-dd'T'HH:mm"),
      allDay: event.allDay,
      color: event.color,
      recurrence: event.recurrence ?? '',
      recurrenceUntil: event.recurrenceUntil
        ? format(parseISO(event.recurrenceUntil), 'yyyy-MM-dd')
        : '',
    });
    setShowModal(true);
  };

  const eventsForDay = (day: Date) =>
    events.filter((e) => {
      const start = parseISO(e.startDate);
      const end = parseISO(e.endDate);
      return day >= new Date(start.toDateString()) && day <= new Date(end.toDateString());
    });

  const selectedDayEvents = selectedDay ? eventsForDay(selectedDay) : [];

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Kalender</h1>
        <button onClick={() => openNewEvent()} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Termin
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="font-semibold">{format(currentMonth, 'MMMM yyyy', { locale: de })}</h2>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-gray-100">
          {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayEvents = eventsForDay(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
            return (
              <button key={day.toISOString()}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                onDoubleClick={() => openNewEvent(day)}
                className={`min-h-[72px] p-1.5 border-b border-r border-gray-50 text-left transition-colors ${
                  isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'
                } ${!isCurrentMonth ? 'opacity-40' : ''}`}>
                <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm mb-1 ${
                  isToday(day) ? 'bg-primary-500 text-white font-bold' : 'text-gray-700'
                }`}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 2).map((event) => (
                    <div key={event.id} className="text-xs px-1 py-0.5 rounded truncate text-white font-medium"
                      style={{ backgroundColor: event.color }}>
                      {event.title}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div className="text-xs text-gray-400 px-1">+{dayEvents.length - 2}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <div className="card">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-sm">
              {format(selectedDay, 'EEEE, d. MMMM', { locale: de })}
            </h3>
            <button onClick={() => openNewEvent(selectedDay)} className="text-xs text-primary-600 hover:underline">
              + Termin
            </button>
          </div>
          {selectedDayEvents.length === 0 ? (
            <p className="p-4 text-sm text-gray-400 text-center">Keine Termine</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {selectedDayEvents.map((event) => (
                <li key={`${event.id}-${event.startDate}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: event.color }} />
                  {event.isRecurring && (
                    <Repeat className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{event.title}</p>
                    {event.description && <p className="text-xs text-gray-400">{event.description}</p>}
                    {!event.allDay && (
                      <p className="text-xs text-gray-400">
                        {format(parseISO(event.startDate), 'HH:mm')} – {format(parseISO(event.endDate), 'HH:mm')} Uhr
                      </p>
                    )}
                  </div>
                  {event.createdBy && (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white shrink-0"
                      style={{ backgroundColor: event.createdBy.color }}>
                      {event.createdBy.name.charAt(0)}
                    </div>
                  )}
                  <button onClick={() => openEditEvent(event)}
                    className="p-1.5 text-gray-300 hover:text-primary-500 transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => { if (confirm('Termin löschen?')) remove.mutate(event.id); }}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditEvent(null); setForm(emptyForm); }}
        title={editEvent ? 'Termin bearbeiten' : 'Neuer Termin'} size="sm">
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="space-y-3">
          <div>
            <label className="label">Titel</label>
            <input className="input" placeholder="Terminbezeichnung" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus />
          </div>
          <div>
            <label className="label">Beschreibung (optional)</label>
            <input className="input" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="allDay" checked={form.allDay}
              onChange={(e) => setForm({ ...form, allDay: e.target.checked })} className="rounded" />
            <label htmlFor="allDay" className="text-sm text-gray-700">Ganztägig</label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Start</label>
              <input type={form.allDay ? 'date' : 'datetime-local'} className="input" value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
            </div>
            <div>
              <label className="label">Ende</label>
              <input type={form.allDay ? 'date' : 'datetime-local'} className="input" value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Wiederholung</label>
              <select className="input" value={form.recurrence}
                onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
                {RECURRENCE.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {form.recurrence && (
              <div>
                <label className="label">Bis (optional)</label>
                <input type="date" className="input" value={form.recurrenceUntil}
                  onChange={(e) => setForm({ ...form, recurrenceUntil: e.target.value })} />
              </div>
            )}
          </div>
          <div>
            <label className="label">Farbe</label>
            <div className="flex gap-2 flex-wrap">
              {EVENT_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button"
              onClick={() => { setShowModal(false); setEditEvent(null); setForm(emptyForm); }}
              className="btn-secondary">Abbrechen</button>
            <button type="submit" disabled={save.isPending} className="btn-primary">
              {save.isPending ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
