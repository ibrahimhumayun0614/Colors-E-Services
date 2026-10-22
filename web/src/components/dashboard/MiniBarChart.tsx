import { cn } from '@/lib/utils';

export interface BarItem {
  label: string;
  value: number;
  color?: string;
}

interface MiniBarChartProps {
  items: BarItem[];
  className?: string;
  animate?: boolean;
  compact?: boolean;
}

export function MiniBarChart({ items, className, animate = true, compact }: MiniBarChartProps) {
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className={cn(compact ? 'space-y-1.5' : 'space-y-2', className)}>
      {items.map((item, index) => (
        <div key={item.label} className={compact ? 'space-y-0.5' : 'space-y-1'}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-medium tabular-nums">{item.value}</span>
          </div>
          <div className={cn('overflow-hidden rounded-full bg-muted', compact ? 'h-1.5' : 'h-2')}>
            <div
              className={cn('h-full rounded-full', animate && 'bar-grow')}
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color ?? 'hsl(var(--primary))',
                animationDelay: animate ? `${index * 80}ms` : undefined,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
