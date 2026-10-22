import { cn } from '@/lib/utils';

interface ProgressRingProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
  animate?: boolean;
}

export function ProgressRing({
  value,
  max,
  size = 44,
  strokeWidth = 4,
  color = 'hsl(var(--primary))',
  className,
  animate = true,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference * (1 - ratio);
  const center = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn('-rotate-90 shrink-0', className)}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted/50"
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={animate ? circumference : offset}
        className={animate ? 'ring-draw' : undefined}
        style={
          animate
            ? ({ '--ring-offset': offset, '--ring-circumference': circumference } as React.CSSProperties)
            : undefined
        }
      />
    </svg>
  );
}
