import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
  destructive?: boolean;
  /** When set (0–100), shows an animated progress bar instead of a plain spinner state. */
  progress?: number | null;
  /** Label shown above the progress bar while running. */
  progressLabel?: string;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  loading,
  destructive,
  progress,
  progressLabel = 'Loading…',
  onConfirm,
}: ConfirmDialogProps) {
  const showProgress = progress != null;
  const pct = Math.min(100, Math.max(0, Math.round(progress ?? 0)));
  const isDone = pct >= 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>

        {showProgress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-muted-foreground">
                {isDone ? 'Done' : progressLabel}
              </span>
              <span className="tabular-nums text-foreground">{pct}%</span>
            </div>
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ease-out',
                  isDone ? 'bg-emerald-500' : 'bg-primary'
                )}
                style={{ width: `${pct}%` }}
              >
                <div className="absolute inset-0 progress-wave" />
                {!isDone && (
                  <div className="absolute inset-y-0 w-1/3 progress-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (showProgress ? `${pct}%` : 'Please wait…') : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
