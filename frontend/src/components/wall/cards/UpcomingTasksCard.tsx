import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { CheckSquare } from 'lucide-react';
import type { Task } from '../../../api/types';
import WallCard from './WallCard';

interface Props {
  tasks: Task[];
  wide?: boolean;
}

const PRIORITY_COLOR: Record<string, string> = {
  high: 'bg-red-500', medium: 'bg-amber-400', low: 'bg-gray-500',
};

export default function UpcomingTasksCard({ tasks, wide }: Props) {
  if (tasks.length === 0) return null;
  return (
    <WallCard icon={CheckSquare} title="Kommende Aufgaben" color="#a3a3a3" wide={wide}>
      <ul className="space-y-1">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 text-base px-2 py-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_COLOR[t.priority] ?? 'bg-gray-500'}`} />
            <span className="flex-1 truncate text-gray-300">{t.title}</span>
            {t.dueDate && (
              <span className="text-xs text-gray-500 tabular-nums">
                {format(parseISO(t.dueDate), 'd.M.', { locale: de })}
              </span>
            )}
          </li>
        ))}
      </ul>
    </WallCard>
  );
}
