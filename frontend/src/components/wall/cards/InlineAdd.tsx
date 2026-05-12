import { useState } from 'react';
import { Plus, X } from 'lucide-react';

interface Props {
  onSubmit: (value: string) => void;
  placeholder: string;
}

export default function InlineAdd({ onSubmit, placeholder }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState('');

  const collapse = () => { setExpanded(false); setValue(''); };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    collapse();
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="mt-3 w-full flex items-center gap-2 px-2 py-2 text-gray-500 hover:text-gray-300 text-sm border border-dashed border-gray-700 rounded-lg hover:border-gray-600 transition-colors"
      >
        <Plus className="w-4 h-4" /> {placeholder}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="mt-3 flex items-center gap-2"
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base focus:outline-none focus:border-primary-500"
      />
      <button type="submit" className="p-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600">
        <Plus className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={collapse}
        className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-gray-200"
      >
        <X className="w-4 h-4" />
      </button>
    </form>
  );
}
