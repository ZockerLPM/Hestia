import { parseISO } from 'date-fns';
import { AlertTriangle, Package } from 'lucide-react';
import type { PantryItem } from '../../../api/types';
import WallCard from './WallCard';

interface Props {
  items: PantryItem[];
  wide?: boolean;
}

function daysUntil(isoDate: string): number {
  return Math.ceil((parseISO(isoDate).getTime() - Date.now()) / 86_400_000);
}

function dayBadge(days: number) {
  if (days < 0)  return <span className="text-xs text-red-400">{Math.abs(days)}d abgelaufen</span>;
  if (days === 0) return <span className="text-xs text-amber-400">heute</span>;
  return (
    <span className={`text-xs ${days <= 2 ? 'text-amber-400' : 'text-gray-500'}`}>{days}d</span>
  );
}

export default function ExpiringCard({ items, wide }: Props) {
  if (items.length === 0) return null;
  return (
    <WallCard icon={AlertTriangle} title="Bald ablaufend" count={items.length} color="#ef4444" wide={wide}>
      <ul className="space-y-1">
        {items.slice(0, 6).map((p) => (
          <li key={p.id} className="flex items-baseline gap-3 px-2 py-1.5 text-lg">
            <Package className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="flex-1 truncate">{p.name}</span>
            {p.expiryDate && dayBadge(daysUntil(p.expiryDate))}
          </li>
        ))}
      </ul>
    </WallCard>
  );
}
