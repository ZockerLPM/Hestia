import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  count?: number;
  color: string;
  wide?: boolean;
  children: React.ReactNode;
}

export default function WallCard({ icon: Icon, title, count, color, wide = false, children }: Props) {
  return (
    <div className={`bg-gray-900 rounded-2xl p-5 border border-gray-800 ${wide ? 'lg:col-span-2' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5" style={{ color }} />
          <h2 className="font-semibold text-lg">{title}</h2>
        </div>
        {count !== undefined && (
          <span className="text-2xl font-bold tabular-nums" style={{ color }}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}
