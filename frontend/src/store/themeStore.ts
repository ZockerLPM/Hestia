import { create } from 'zustand';

type Mode = 'light' | 'dark' | 'system';

interface ThemeStore {
  mode: Mode;
  setMode: (m: Mode) => void;
  applyMode: () => void;
}

function resolveDark(mode: Mode): boolean {
  if (mode === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches;
  return mode === 'dark';
}

function apply(mode: Mode) {
  const dark = resolveDark(mode);
  document.documentElement.classList.toggle('dark', dark);
}

const initial = (localStorage.getItem('hestia-theme') as Mode | null) ?? 'system';

export const useThemeStore = create<ThemeStore>((set) => ({
  mode: initial,
  setMode: (mode) => {
    localStorage.setItem('hestia-theme', mode);
    apply(mode);
    set({ mode });
  },
  applyMode: () => apply(initial),
}));

if (typeof window !== 'undefined') {
  apply(initial);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const cur = (localStorage.getItem('hestia-theme') as Mode | null) ?? 'system';
    if (cur === 'system') apply('system');
  });
}
