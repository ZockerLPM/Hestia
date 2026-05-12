import { Utensils, Check } from 'lucide-react';
import type { MealPlan } from '../../../api/types';
import WallCard from './WallCard';

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Früh', lunch: 'Mittag', dinner: 'Abend', snack: 'Snack',
};

interface Props {
  meals: MealPlan[];
  wide?: boolean;
  onCook: (id: string) => void;
}

export default function MealsCard({ meals, wide, onCook }: Props) {
  return (
    <WallCard icon={Utensils} title="Mahlzeiten heute" count={meals.length} color="#ec4899" wide={wide}>
      {meals.length === 0 ? (
        <p className="text-gray-500 text-lg py-4">Nichts geplant.</p>
      ) : (
        <ul className="space-y-1">
          {meals.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => { if (!m.cooked) onCook(m.id); }}
                disabled={m.cooked}
                className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors ${
                  m.cooked ? 'opacity-50 cursor-default' : 'hover:bg-gray-800'
                }`}
              >
                <span className="text-xs uppercase text-gray-500 w-14 shrink-0">
                  {MEAL_LABEL[m.mealType] ?? m.mealType}
                </span>
                {m.cooked && <Check className="w-4 h-4 text-green-400 shrink-0" />}
                <span className={`flex-1 truncate text-lg ${m.cooked ? 'line-through' : ''}`}>
                  {m.recipe?.title ?? m.customTitle}
                </span>
                <span className="text-xs text-gray-500 shrink-0">{m.servings} P.</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </WallCard>
  );
}
