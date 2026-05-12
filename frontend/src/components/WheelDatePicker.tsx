import { useEffect, useRef } from 'react';

interface Props {
  value: Date | null;
  onChange: (date: Date | null) => void;
  minYear?: number;
  maxYear?: number;
  allowNull?: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export default function WheelDatePicker({ value, onChange, minYear, maxYear, allowNull = true }: Props) {
  const now = new Date();
  const minY = minYear ?? now.getFullYear() - 1;
  const maxY = maxYear ?? now.getFullYear() + 5;

  const year = value?.getFullYear() ?? now.getFullYear();
  const month = value?.getMonth() ?? now.getMonth();
  const day = value?.getDate() ?? now.getDate();

  const set = (y: number, m: number, d: number) => {
    const maxD = daysInMonth(y, m);
    const clampedDay = Math.min(d, maxD);
    onChange(new Date(y, m, clampedDay));
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">
          Mindesthaltbarkeit
        </span>
        <div className="flex items-center gap-2">
          {value && (
            <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
              {day}.{MONTHS[month]} {year}
            </span>
          )}
          {allowNull && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className={`text-xs px-2 py-1 rounded-md transition-colors ${
                value === null
                  ? 'bg-primary-500 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-500'
              }`}
            >
              Kein MHD
            </button>
          )}
        </div>
      </div>

      <div className="relative grid grid-cols-3 gap-2">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-10 bg-white/60 dark:bg-gray-700/40 rounded-lg ring-1 ring-primary-200 dark:ring-primary-700/40" />

        <Wheel
          values={Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1)}
          current={day}
          render={(v) => String(v).padStart(2, '0')}
          onPick={(d) => set(year, month, d)}
        />
        <Wheel
          values={Array.from({ length: 12 }, (_, i) => i)}
          current={month}
          render={(m) => MONTHS[m]}
          onPick={(m) => set(year, m, day)}
        />
        <Wheel
          values={Array.from({ length: maxY - minY + 1 }, (_, i) => minY + i)}
          current={year}
          render={(v) => String(v)}
          onPick={(y) => set(y, month, day)}
        />
      </div>
    </div>
  );
}

interface WheelProps<T> {
  values: T[];
  current: T;
  render: (v: T) => string;
  onPick: (v: T) => void;
}

const ITEM_H = 40;

function Wheel<T>({ values, current, render, onPick }: WheelProps<T>) {
  const ref = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const idx = values.indexOf(current);
    if (ref.current && idx >= 0) {
      ref.current.scrollTop = idx * ITEM_H;
    }
  }, [current, values]);

  const handleScroll = () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.round(ref.current.scrollTop / ITEM_H);
      const next = values[Math.max(0, Math.min(idx, values.length - 1))];
      if (next !== undefined && next !== current) onPick(next);
    }, 80);
  };

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className="h-32 overflow-y-scroll snap-y snap-mandatory scrollbar-hide select-none touch-pan-y"
      style={{ scrollSnapStop: 'always' }}
    >
      <div style={{ height: ITEM_H }} />
      {values.map((v, i) => {
        const active = v === current;
        return (
          <button
            type="button"
            key={i}
            onClick={() => onPick(v)}
            className={`h-10 w-full snap-center flex items-center justify-center text-base transition-all ${
              active
                ? 'text-gray-900 dark:text-white font-semibold scale-100'
                : 'text-gray-400 dark:text-gray-500 scale-90'
            }`}
          >
            {render(v)}
          </button>
        );
      })}
      <div style={{ height: ITEM_H }} />
    </div>
  );
}
