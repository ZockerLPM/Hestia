import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';

const MODES = [
  { value: 'light', icon: Sun, label: 'Hell' },
  { value: 'dark', icon: Moon, label: 'Dunkel' },
  { value: 'system', icon: Monitor, label: 'System' },
] as const;

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useThemeStore();
  const order = MODES.map((m) => m.value);
  const next = order[(order.indexOf(mode) + 1) % order.length];
  const Current = MODES.find((m) => m.value === mode)!.icon;

  if (compact) {
    return (
      <button onClick={() => setMode(next)} aria-label={`Theme: ${mode}`}
        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400">
        <Current className="w-4 h-4" />
      </button>
    );
  }
  return (
    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
      {MODES.map(({ value, icon: Icon, label }) => (
        <button key={value} onClick={() => setMode(value)} title={label}
          className={`p-1.5 rounded-md transition-colors ${
            mode === value ? 'bg-white dark:bg-gray-700 shadow text-primary-600' : 'text-gray-500 dark:text-gray-400'
          }`}>
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}
