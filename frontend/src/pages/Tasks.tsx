import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Plus, Trash2, Edit2, Check, AlertCircle, Bookmark, X } from 'lucide-react';
import Modal from '../components/ui/Modal';
import type { Task, User, TaskTemplate } from '../api/types';

const PRIORITIES = {
  high: { label: 'Hoch', color: 'bg-red-100 text-red-700' },
  medium: { label: 'Mittel', color: 'bg-amber-100 text-amber-700' },
  low: { label: 'Niedrig', color: 'bg-gray-100 text-gray-600' },
};
const RECURRING = [
  { value: '', label: 'Einmalig' },
  { value: 'daily', label: 'Täglich' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'monthly', label: 'Monatlich' },
];

const emptyForm = { title: '', description: '', priority: 'medium', dueDate: '', assignedToId: '', recurring: '' };

export default function Tasks() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'open' | 'done'>('open');
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    title: '', description: '', priority: 'medium', assignedToId: '', defaultDueInDays: '',
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', filter],
    queryFn: () => api.get(`/tasks?completed=${filter === 'done'}`).then((r) => r.data),
  });

  const save = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = { ...data, dueDate: data.dueDate || null, assignedToId: data.assignedToId || null };
      return editTask ? api.put(`/tasks/${editTask.id}`, payload) : api.post('/tasks', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(editTask ? 'Aufgabe aktualisiert' : 'Aufgabe erstellt');
      setShowModal(false);
      setEditTask(null);
      setForm(emptyForm);
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      api.put(`/tasks/${id}`, { completed }),
    onSuccess: (_data, { completed }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      if (completed) toast.success('Erledigt 🎉');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Aufgabe gelöscht');
    },
  });

  const { data: templates = [] } = useQuery<TaskTemplate[]>({
    queryKey: ['task-templates'],
    queryFn: () => api.get('/tasks/templates/all').then((r) => r.data),
  });

  const saveTemplate = useMutation({
    mutationFn: () => api.post('/tasks/templates', {
      ...templateForm,
      defaultDueInDays: templateForm.defaultDueInDays ? Number(templateForm.defaultDueInDays) : null,
      assignedToId: templateForm.assignedToId || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-templates'] });
      setTemplateForm({ title: '', description: '', priority: 'medium', assignedToId: '', defaultDueInDays: '' });
      toast.success('Vorlage gespeichert');
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-templates'] }),
  });

  const spawnTemplate = useMutation({
    mutationFn: (id: string) => api.post(`/tasks/templates/${id}/spawn`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Aufgabe aus Vorlage erstellt');
    },
  });

  const openEdit = (task: Task) => {
    setEditTask(task);
    setForm({
      title: task.title, description: task.description || '', priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
      assignedToId: task.assignedTo?.id || '', recurring: task.recurring || '',
    });
    setShowModal(true);
  };

  const now = new Date();

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Aufgaben</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowTemplates(true)} className="btn-secondary flex items-center gap-2">
            <Bookmark className="w-4 h-4" /> Vorlagen
          </button>
          <button onClick={() => { setEditTask(null); setForm(emptyForm); setShowModal(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Aufgabe
          </button>
        </div>
      </div>

      {templates.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {templates.slice(0, 8).map((t) => (
            <button key={t.id} onClick={() => spawnTemplate.mutate(t.id)}
              className="shrink-0 text-xs bg-white border border-gray-200 rounded-full px-3 py-1.5 hover:bg-primary-50 hover:border-primary-300 transition-colors">
              <Bookmark className="w-3 h-3 inline mr-1 text-primary-500" />{t.title}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {([['open', 'Offen'], ['done', 'Erledigt']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tasks.length === 0 ? (
        <div className="card p-10 text-center text-gray-400 text-sm">
          {filter === 'open' ? 'Keine offenen Aufgaben 🎉' : 'Keine erledigten Aufgaben'}
        </div>
      ) : (
        <div className="card divide-y divide-gray-50">
          {tasks.map((task) => {
            const isOverdue = !task.completed && task.dueDate && new Date(task.dueDate) < now;
            const p = PRIORITIES[task.priority as keyof typeof PRIORITIES];
            return (
              <div key={task.id} className="flex items-start gap-3 px-4 py-4">
                <button onClick={() => toggle.mutate({ id: task.id, completed: !task.completed })}
                  className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    task.completed ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-primary-500'
                  }`}>
                  {task.completed && <Check className="w-3 h-3 text-white" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-medium ${task.completed ? 'line-through text-gray-400' : ''}`}>
                      {task.title}
                    </p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${p.color}`}>{p.label}</span>
                    {task.recurring && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        {RECURRING.find((r) => r.value === task.recurring)?.label}
                      </span>
                    )}
                  </div>
                  {task.description && <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {task.dueDate && (
                      <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                        {isOverdue && <AlertCircle className="w-3 h-3" />}
                        {format(new Date(task.dueDate), 'd. MMM', { locale: de })}
                      </span>
                    )}
                    {task.assignedTo && (
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 rounded-full flex items-center justify-center text-white"
                          style={{ backgroundColor: task.assignedTo.color, fontSize: '9px' }}>
                          {task.assignedTo.name.charAt(0)}
                        </div>
                        <span className="text-xs text-gray-400">{task.assignedTo.name}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(task)} className="p-1.5 text-gray-300 hover:text-primary-500 transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => { if (confirm('Aufgabe löschen?')) remove.mutate(task.id); }}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditTask(null); }}
        title={editTask ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="space-y-3">
          <div>
            <label className="label">Titel</label>
            <input className="input" placeholder="Was muss erledigt werden?" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus />
          </div>
          <div>
            <label className="label">Beschreibung (optional)</label>
            <textarea className="input resize-none" rows={2} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Priorität</label>
              <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {Object.entries(PRIORITIES).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Fällig am</label>
              <input type="date" className="input" value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Zugewiesen an</label>
              <select className="input" value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
                <option value="">Niemand</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Wiederholung</label>
              <select className="input" value={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.value })}>
                {RECURRING.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setShowModal(false); setEditTask(null); }} className="btn-secondary">Abbrechen</button>
            <button type="submit" disabled={save.isPending} className="btn-primary">
              {save.isPending ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={showTemplates} onClose={() => setShowTemplates(false)} title="Aufgaben-Vorlagen">
        <div className="space-y-3">
          {templates.length > 0 && (
            <ul className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-3 py-2">
                  <Bookmark className="w-3.5 h-3.5 text-primary-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <p className="text-[10px] text-gray-400">
                      {PRIORITIES[t.priority as keyof typeof PRIORITIES]?.label ?? t.priority}
                      {t.defaultDueInDays != null && ` · fällig in ${t.defaultDueInDays}d`}
                    </p>
                  </div>
                  <button onClick={() => spawnTemplate.mutate(t.id)}
                    className="text-xs text-primary-600 hover:underline">Anwenden</button>
                  <button onClick={() => deleteTemplate.mutate(t.id)} className="p-1 text-gray-300 hover:text-red-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={(e) => { e.preventDefault(); saveTemplate.mutate(); }} className="space-y-2 pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500">Neue Vorlage</p>
            <input className="input" placeholder="Titel" required value={templateForm.title}
              onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={templateForm.priority}
                onChange={(e) => setTemplateForm({ ...templateForm, priority: e.target.value })}>
                {Object.entries(PRIORITIES).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
              </select>
              <input type="number" min="0" className="input" placeholder="Fällig in X Tagen"
                value={templateForm.defaultDueInDays}
                onChange={(e) => setTemplateForm({ ...templateForm, defaultDueInDays: e.target.value })} />
            </div>
            <select className="input" value={templateForm.assignedToId}
              onChange={(e) => setTemplateForm({ ...templateForm, assignedToId: e.target.value })}>
              <option value="">Niemand zugewiesen</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button type="submit" className="btn-primary w-full">Vorlage speichern</button>
          </form>
        </div>
      </Modal>
    </div>
  );
}
