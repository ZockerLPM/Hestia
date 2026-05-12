interface Props {
  children: React.ReactNode;
  color?: string;
  variant?: 'solid' | 'soft';
}

export default function Badge({ children, color = '#6366f1', variant = 'soft' }: Props) {
  if (variant === 'solid') {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
        style={{ backgroundColor: color }}
      >
        {children}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {children}
    </span>
  );
}
