import { ShoppingCart } from 'lucide-react';
import type { ShoppingItem } from '../../../api/types';
import WallCard from './WallCard';
import InlineAdd from './InlineAdd';

interface Props {
  items: ShoppingItem[];
  wide?: boolean;
  hasDefaultList: boolean;
  onToggle: (id: string) => void;
  onAdd: (name: string) => void;
}

export default function ShoppingCard({ items, wide, hasDefaultList, onToggle, onAdd }: Props) {
  return (
    <WallCard icon={ShoppingCart} title="Einkaufsliste" count={items.length} color="#f59e0b" wide={wide ?? true}>
      {items.length === 0 ? (
        <p className="text-gray-500 text-lg py-4">Liste ist leer. 🛒</p>
      ) : (
        <ul className="space-y-1 max-h-72 overflow-y-auto pr-1">
          {items.map((i) => (
            <li key={i.id}>
              <button
                onClick={() => onToggle(i.id)}
                className="w-full flex items-baseline gap-3 px-2 py-2 rounded-lg hover:bg-gray-800 text-left"
              >
                <span className="w-5 h-5 rounded-full border-2 border-gray-600 shrink-0 mt-0.5" />
                <span className="flex-1 truncate text-lg">{i.name}</span>
                <span className="text-sm text-gray-500 shrink-0">{i.quantity} {i.unit}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasDefaultList && (
        <InlineAdd onSubmit={onAdd} placeholder="Auf die Liste setzen…" />
      )}
    </WallCard>
  );
}
