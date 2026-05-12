import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { CheckSquare, Check } from 'lucide-react';
import type { Task } from '../../../api/types';
import WallCard from './WallCard';
import InlineAdd from './InlineAdd';

interface Props {
  tasks: Task[];
  wide?: boolean;
  onToggle: (id: string) => void;
  onAdd: (title: string) => void;
}

const PRIORITY_COLOR: Record<string, string> = {
  high: 'bg-red-500', medium: 'bg-amber-400', low: 'bg-gray-500',
};

export default function TasksCard({ tasks, wide, onToggle, onAdd }: Props) {
  return (
    <WallCard icon={CheckSquare} title="Aufgaben heute" count={tasks.length} color="#22c55e" wide={wide}>
      {tasks.length === 0 ? (
        <p className="text-gray-500 text-lg py-4">🎉 Nichts offen.</p>
      ) : (
        <ul className="space-y-1">
          {tasks.slice(0, 6).map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onToggle(t.id)}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-800 transition-colors text-left group"
              >
                <span className="w-6 h-6 rounded-full border-2 border-gray-600 flex items-center justify-center shrink-0 group-hover:border-green-500 group-hover:bg-green-500/20 transition-colors">
                  <Check className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100" />
                </span>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${PRIORITY_COLOR[t.priority] ?? 'bg-gray-500'}`} />
                <span className="flex-1 truncate text-lg">{t.title}</span>
                {t.dueDate && (
                  <span className="text-xs text-gray-500 tabular-nums">
                    {format(parseISO(t.dueDate), 'd.M.', { locale: de })}
                  </span>
                )}
                {t.assignedTo && (
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ backgroundColor: t.assignedTo.color }}
                  >
                    {t.assignedTo.name.charAt(0)}
                  </span>
                )}
              </button>
            </li>
          ))}
          {tasks.length > 6 && (
            <li className="text-sm text-gray-500 px-2">+{tasks.length - 6} weitere</li>
          )}
        </ul>
      )}
      <InlineAdd onSubmit={onAdd} placeholder="Neue Aufgabe…" />
    </WallCard>
  );
}
