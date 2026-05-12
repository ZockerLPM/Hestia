import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Calendar } from 'lucide-react';
import type { CalendarEvent } from '../../../api/types';
import WallCard from './WallCard';

interface Props {
  todayEvents: CalendarEvent[];
  upcomingEvents: CalendarEvent[];
  wide?: boolean;
}

export default function EventsCard({ todayEvents, upcomingEvents, wide }: Props) {
  return (
    <WallCard icon={Calendar} title="Termine heute" count={todayEvents.length} color="#6366f1" wide={wide}>
      {todayEvents.length === 0 ? (
        <p className="text-gray-500 text-lg py-4">Keine Termine.</p>
      ) : (
        <ul className="space-y-2">
          {todayEvents.slice(0, 5).map((e) => (
            <li key={`${e.id}-${e.startDate}`} className="flex items-center gap-3 text-lg px-2 py-1">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
              <span className="flex-1 truncate">{e.title}</span>
              {!e.allDay && (
                <span className="text-sm text-gray-400 tabular-nums">
                  {format(parseISO(e.startDate), 'HH:mm')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {upcomingEvents.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Nächste Tage</p>
          <ul className="space-y-1">
            {upcomingEvents.map((e) => (
              <li key={`${e.id}-${e.startDate}`} className="flex items-center gap-2 text-sm text-gray-400">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                <span className="flex-1 truncate">{e.title}</span>
                <span className="text-xs">{format(parseISO(e.startDate), 'd.M.', { locale: de })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </WallCard>
  );
}
