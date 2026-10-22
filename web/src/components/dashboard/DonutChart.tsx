import { cn } from '@/lib/utils';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  className?: string;
  animate?: boolean;
  variant?: 'pie' | 'donut';
  centerValue?: string;
  centerLabel?: string;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function pieSlice(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const sweep = endAngle - startAngle;

  if (sweep >= 359.99) {
    return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r} Z`;
  }

  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = sweep > 180 ? 1 : 0;

  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

export function DonutChart({
  segments,
  size = 88,
  strokeWidth = 12,
  className,
  animate = true,
  variant = 'pie',
  centerValue,
  centerLabel,
}: DonutChartProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const center = size / 2;

  if (variant === 'donut') {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    return (
      <div className={cn('relative inline-flex shrink-0', className)}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/30"
          />
          {total > 0 &&
            segments.map((segment) => {
              const length = (segment.value / total) * circumference;
              const dashOffset = -offset;
              offset += length;

              return (
                <circle
                  key={segment.label}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="butt"
                  className={animate ? 'pie-segment' : undefined}
                />
              );
            })}
        </svg>
        {(centerValue || centerLabel) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {centerValue && (
              <span className="text-2xl font-bold tracking-tight tabular-nums">{centerValue}</span>
            )}
            {centerLabel && (
              <span className="text-[11px] text-muted-foreground/70">{centerLabel}</span>
            )}
          </div>
        )}
      </div>
    );
  }

  const radius = center - 2;
  let angle = 0;
  const slices = segments.map((segment) => {
    const sweep = total > 0 ? (segment.value / total) * 360 : 0;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    return { ...segment, path: pieSlice(center, center, radius, start, end) };
  });

  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Chart total ${total}`}>
        {total === 0 ? (
          <circle cx={center} cy={center} r={radius} className="fill-muted/50" />
        ) : (
          slices.map((slice, index) => (
            <path
              key={slice.label}
              d={slice.path}
              fill={slice.color}
              className={animate ? 'pie-segment' : undefined}
              style={animate ? { animationDelay: `${index * 80}ms` } : undefined}
            />
          ))
        )}
      </svg>
    </div>
  );
}
