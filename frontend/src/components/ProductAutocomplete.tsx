import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export interface ProductSuggestion {
  name: string;
  unit: string;
  category: string | null;
  location: string | null;
  barcode: string | null;
  count: number;
  source: 'pantry' | 'shopping' | 'recipe';
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: ProductSuggestion) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export default function ProductAutocomplete({
  value, onChange, onSelect, placeholder, required, autoFocus, className,
}: Props) {
  const [debounced, setDebounced] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 150);
    return () => clearTimeout(t);
  }, [value]);

  const { data: suggestions = [] } = useQuery<ProductSuggestion[]>({
    queryKey: ['product-suggestions', debounced],
    queryFn: () => api.get(`/suggestions/products?q=${encodeURIComponent(debounced)}`, { silent: true }).then((r) => r.data),
    enabled: debounced.length >= 1,
    staleTime: 30_000,
  });

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const select = (s: ProductSuggestion) => {
    onChange(s.name);
    onSelect?.(s);
    setOpen(false);
    setActiveIdx(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      select(suggestions[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && suggestions.length > 0;

  return (
    <div ref={wrapRef} className={`relative ${className ?? ''}`}>
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActiveIdx(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul className="absolute z-30 left-0 right-0 mt-1 max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:bg-gray-800 dark:border-gray-700 text-sm">
          {suggestions.map((s, idx) => (
            <li key={`${s.name}-${s.source}`}>
              <button type="button"
                onMouseDown={(e) => { e.preventDefault(); select(s); }}
                onMouseEnter={() => setActiveIdx(idx)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 ${
                  idx === activeIdx ? 'bg-primary-50 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}>
                <span className="flex-1">{s.name}</span>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  {s.unit && <span>{s.unit}</span>}
                  {s.category && <span>· {s.category}</span>}
                  {s.location && <span>· {s.location}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
