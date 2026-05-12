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
    <div className={`bg-gray-900 rounded-xl xl:rounded-2xl p-2.5 xl:p-5 border border-gray-800 ${wide ? 'xl:col-span-2' : ''}`}>
      <div className="flex items-center justify-between mb-2 xl:mb-3">
        <div className="flex items-center gap-1.5 xl:gap-2 min-w-0">
          <Icon className="w-4 h-4 xl:w-5 xl:h-5 shrink-0" style={{ color }} />
          <h2 className="font-semibold text-sm xl:text-lg truncate">{title}</h2>
        </div>
        {count !== undefined && (
          <span className="text-base xl:text-2xl font-bold tabular-nums shrink-0 ml-2" style={{ color }}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}
