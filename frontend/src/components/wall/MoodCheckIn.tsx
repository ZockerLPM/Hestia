import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

interface MoodLog {
  id: string;
  mood: number;
  loggedAt: string;
}

const MOODS = [
  { value: 1, emoji: '😞', label: 'Schlecht' },
  { value: 2, emoji: '😕', label: 'Nicht so gut' },
  { value: 3, emoji: '😐', label: 'Ok' },
  { value: 4, emoji: '😊', label: 'Gut' },
  { value: 5, emoji: '😄', label: 'Super' },
];

interface Props {
  userId?: string;
  onDone?: () => void;
}

export default function MoodCheckIn({ userId, onDone }: Props) {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  const { data: todayMood } = useQuery<MoodLog | null>({
    queryKey: ['mood-today', userId ?? 'anonymous'],
    queryFn: () => api.get('/mood/today').then((r) => r.data),
    staleTime: 60 * 60 * 1000,
  });

  const logMood = useMutation({
    mutationFn: (mood: number) => api.post('/mood', { mood }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mood-today', userId ?? 'anonymous'] });
      setTimeout(() => { onDone?.(); }, 1200);
    },
  });

  // Bereits heute eingecheckt oder weggeklickt → nicht anzeigen
  if (dismissed || todayMood) return null;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 animate-in fade-in duration-300">
      <p className="text-gray-300 text-sm mb-4 text-center">Wie geht's dir heute?</p>
      <div className="flex justify-between gap-1">
        {MOODS.map((m) => (
          <button
            key={m.value}
            onClick={() => logMood.mutate(m.value)}
            disabled={logMood.isPending}
            title={m.label}
            className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-50"
          >
            <span className="text-3xl">{m.emoji}</span>
            <span className="text-xs text-gray-500">{m.label}</span>
          </button>
        ))}
      </div>
      {logMood.isSuccess && (
        <p className="text-center text-green-400 text-sm mt-3">Danke! Schönen Tag ✓</p>
      )}
      <button
        onClick={() => setDismissed(true)}
        className="mt-3 w-full text-xs text-gray-600 hover:text-gray-400 text-center"
      >
        Überspringen
      </button>
    </div>
  );
}
