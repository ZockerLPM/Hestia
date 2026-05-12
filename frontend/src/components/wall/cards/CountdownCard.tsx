import { differenceInDays, format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Timer } from 'lucide-react';
import type { CalendarEvent } from '../../../api/types';
import WallCard from './WallCard';

/** Events whose title starts with one of these emoji prefixes appear as countdowns */
export const COUNTDOWN_PREFIXES = ['📍', '🎂', '🗓️', '⭐'];

export function isCountdownEvent(e: CalendarEvent): boolean {
  return COUNTDOWN_PREFIXES.some((p) => e.title.startsWith(p));
}

interface Props {
  events: CalendarEvent[];
  wide?: boolean;
}

export default function CountdownCard({ events, wide }: Props) {
  if (events.length === 0) return null;
  const today = new Date();
  return (
    <WallCard icon={Timer} title="Countdowns" color="#8b5cf6" wide={wide}>
      <ul className="space-y-2">
        {events.slice(0, 5).map((e) => {
          const days = differenceInDays(parseISO(e.startDate), today);
          return (
            <li key={e.id} className="flex items-center gap-3 px-2 py-1.5">
              <span className={`text-2xl font-bold tabular-nums w-12 text-right shrink-0 ${
                days === 0 ? 'text-green-400' : days <= 3 ? 'text-amber-400' : 'text-violet-400'
              }`}>
                {days === 0 ? '🎉' : `${days}d`}
              </span>
              <span className="flex-1 truncate text-gray-300">{e.title}</span>
              <span className="text-xs text-gray-500 shrink-0">
                {format(parseISO(e.startDate), 'd.M.', { locale: de })}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-gray-600 mt-3 px-2">
        Kalendereinträge mit {COUNTDOWN_PREFIXES.join(' ')} im Titel erscheinen hier.
      </p>
    </WallCard>
  );
}
