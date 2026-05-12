import { PiggyBank } from 'lucide-react';
import type { Budget } from '../../../api/types';
import WallCard from './WallCard';

interface Props {
  budgets: Budget[];
  wide?: boolean;
  currency?: string;
}

export default function BudgetCard({ budgets, wide, currency = 'CHF' }: Props) {
  if (budgets.length === 0) return null;
  return (
    <WallCard icon={PiggyBank} title="Budget diesen Monat" color="#10b981" wide={wide}>
      <ul className="space-y-3">
        {budgets.slice(0, 5).map((b) => (
          <li key={b.categoryId}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-300 truncate">{b.categoryIcon} {b.categoryName}</span>
              <span className={`tabular-nums shrink-0 ml-2 ${
                b.percent > 1 ? 'text-red-400' : b.percent > 0.8 ? 'text-amber-400' : 'text-gray-400'
              }`}>
                {b.spent.toFixed(0)} / {b.limit.toFixed(0)} {currency}
              </span>
            </div>
            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  b.percent > 1 ? 'bg-red-500' : b.percent > 0.8 ? 'bg-amber-400' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(b.percent * 100, 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </WallCard>
  );
}
