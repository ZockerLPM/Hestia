import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Bookmark, ShoppingCart, Plus } from 'lucide-react';
import { api } from '../api/client';
import type { ShoppingList, TaskTemplate } from '../api/types';
import ProductAutocomplete from './ProductAutocomplete';

export default function QuickAdd() {
  const qc = useQueryClient();
  const [text, setText] = useState('');

  const { data: lists = [] } = useQuery<ShoppingList[]>({
    queryKey: ['shopping-lists'],
    queryFn: () => api.get('/shopping/lists').then((r) => r.data),
  });

  const { data: templates = [] } = useQuery<TaskTemplate[]>({
    queryKey: ['task-templates'],
    queryFn: () => api.get('/tasks/templates/all').then((r) => r.data),
  });

  const defaultListId = lists.find((l) => l.isDefault)?.id ?? lists[0]?.id;

  const addToShopping = useMutation({
    mutationFn: ({ name, unit }: { name: string; unit: string }) =>
      api.post('/shopping/items', { listId: defaultListId, name, quantity: 1, unit }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping-items'] });
      qc.invalidateQueries({ queryKey: ['shopping-lists'] });
      toast.success('Zur Einkaufsliste');
      setText('');
    },
  });

  const spawnTemplate = useMutation({
    mutationFn: (id: string) => api.post(`/tasks/templates/${id}/spawn`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Aufgabe erstellt');
    },
  });

  if (!defaultListId && templates.length === 0) return null;

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold text-sm flex items-center gap-2">
        <Plus className="w-4 h-4 text-primary-500" /> Schnell hinzufügen
      </h2>

      {defaultListId && (
        <div className="flex gap-2">
          <div className="flex-1">
            <ProductAutocomplete
              value={text}
              placeholder="Auf Einkaufsliste setzen…"
              onChange={setText}
              onSelect={(s) => addToShopping.mutate({ name: s.name, unit: s.unit || 'Stück' })}
            />
          </div>
          <button
            onClick={() => text.trim() && addToShopping.mutate({ name: text.trim(), unit: 'Stück' })}
            disabled={!text.trim() || addToShopping.isPending}
            className="btn-primary px-3"
            aria-label="Hinzufügen">
            <ShoppingCart className="w-4 h-4" />
          </button>
        </div>
      )}

      {templates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {templates.slice(0, 6).map((t) => (
            <button key={t.id} onClick={() => spawnTemplate.mutate(t.id)}
              className="text-xs bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5 hover:bg-primary-50 hover:border-primary-300 transition-colors flex items-center gap-1">
              <Bookmark className="w-3 h-3 text-primary-500" />{t.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
