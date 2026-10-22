import { Link } from 'react-router-dom';
import { DollarSign, Globe } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { getDefaultCurrency } from '@/lib/services';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const glanceCard = 'rounded-2xl border bg-card shadow-sm';

function PriorityBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
    medium: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400',
    low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400',
  };
  const labels = { high: 'High', medium: 'Medium', low: 'Low' };

  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase', styles[level])}>
      {labels[level]}
    </span>
  );
}

function PipelineRow({
  label,
  meta,
  count,
  total,
  color,
  active,
}: {
  label: string;
  meta: string;
  count: number;
  total: number;
  color: string;
  active?: boolean;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg px-1 py-2',
        active && 'bg-muted/40'
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', active ? 'font-semibold' : 'font-medium')}>{label}</p>
        <p className="text-xs text-muted-foreground/70">{meta}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.max(pct, count > 0 ? 8 : 0)}%`, backgroundColor: color }}
          />
        </div>
        <span className="w-9 text-right text-xs font-semibold tabular-nums text-muted-foreground">
          {pct}%
        </span>
      </div>
    </div>
  );
}

export function ActionItemsCard({
  allClear,
  needsAttention,
  renewalsCount,
  overdueCount,
  tasksCount,
  items,
}: {
  allClear: boolean;
  needsAttention: number;
  renewalsCount: number;
  overdueCount: number;
  tasksCount: number;
  items: { id: string; title: string; description: string; priority: 'high' | 'medium'; href: string }[];
}) {
  return (
    <Card className={glanceCard}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 p-6 pb-4">
        <div>
          <CardTitle className="text-base font-semibold">Action items</CardTitle>
          <CardDescription className="mt-1 text-muted-foreground/70">
            {allClear ? 'Nothing urgent right now' : 'Track items that need attention'}
          </CardDescription>
          {!allClear && (
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight tabular-nums">{needsAttention}</span>
              <span className="text-sm text-muted-foreground/70">requiring action</span>
            </div>
          )}
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link to={allClear ? '/clients' : '/services'}>View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 px-6 pb-6 pt-0">
        {!allClear && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                Renewals
              </p>
              <p className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {renewalsCount}
              </p>
            </div>
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                Overdue
              </p>
              <p className="text-lg font-bold tabular-nums text-red-600">{overdueCount}</p>
            </div>
            <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                Tasks
              </p>
              <p className="text-lg font-bold tabular-nums text-orange-700 dark:text-orange-400">
                {tasksCount}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {allClear ? (
            <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center">
              <p className="text-sm font-medium">All caught up</p>
              <p className="mt-1 text-xs text-muted-foreground/70">No renewals, overdue invoices, or tasks</p>
            </div>
          ) : (
            items.map((item) => (
              <Link
                key={item.id}
                to={item.href}
                className="block rounded-xl border bg-background p-3 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground/70">{item.description}</p>
                  </div>
                  <PriorityBadge level={item.priority} />
                </div>
              </Link>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function RenewalPipelineCard({
  buckets,
}: {
  buckets: { label: string; count: number; color: string }[];
}) {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const closestIndex = buckets.findIndex((b) => b.count > 0);

  return (
    <Card className={glanceCard}>
      <CardHeader className="p-6 pb-4">
        <CardTitle className="text-base font-semibold">Renewal pipeline</CardTitle>
        <CardDescription className="mt-1 text-muted-foreground/70">
          Upcoming expiries in the next 10 days
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-6 pb-6 pt-0">
        {total > 0 && (
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            {buckets.map((b) =>
              b.count > 0 ? (
                <div
                  key={b.label}
                  className="h-full transition-all"
                  style={{
                    width: `${(b.count / total) * 100}%`,
                    backgroundColor: b.color,
                  }}
                  title={`${b.label}: ${b.count}`}
                />
              ) : null
            )}
          </div>
        )}

        <div className="divide-y">
          {buckets.map((bucket, index) => (
            <PipelineRow
              key={bucket.label}
              label={bucket.label}
              meta={`${bucket.count} ${bucket.count === 1 ? 'service' : 'services'}`}
              count={bucket.count}
              total={total}
              color={bucket.color}
              active={index === closestIndex}
            />
          ))}
        </div>

        <Button asChild variant="outline" size="sm" className="w-full">
          <Link to="/services">
            <Globe className="h-4 w-4" />
            View renewals
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function RevenuePipelineCard({
  outstanding,
  monthlyHosting,
  invoiceStatus,
}: {
  outstanding: number;
  monthlyHosting: number;
  invoiceStatus: { paid: number; sent: number; overdue: number; draft: number };
}) {
  const rows = [
    { label: 'Paid', count: invoiceStatus.paid, color: '#10b981' },
    { label: 'Sent', count: invoiceStatus.sent, color: '#f59e0b' },
    { label: 'Overdue', count: invoiceStatus.overdue, color: '#ef4444' },
    { label: 'Draft', count: invoiceStatus.draft, color: '#94a3b8' },
  ];
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <Card className={glanceCard}>
      <CardHeader className="p-6 pb-4">
        <CardTitle className="text-base font-semibold">Revenue</CardTitle>
        <CardDescription className="mt-1 text-muted-foreground/70">
          Billing and invoice status
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-6 pb-6 pt-0">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              Outstanding
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {formatCurrency(outstanding, getDefaultCurrency())}
            </p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              Hosting / mo
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatCurrency(monthlyHosting, getDefaultCurrency())}</p>
          </div>
        </div>

        {total > 0 && (
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            {rows.map((r) =>
              r.count > 0 ? (
                <div
                  key={r.label}
                  className="h-full"
                  style={{ width: `${(r.count / total) * 100}%`, backgroundColor: r.color }}
                />
              ) : null
            )}
          </div>
        )}

        <div className="divide-y">
          {rows.map((row) => (
            <PipelineRow
              key={row.label}
              label={row.label}
              meta={`${row.count} invoice${row.count !== 1 ? 's' : ''}`}
              count={row.count}
              total={total}
              color={row.color}
              active={row.label === 'Overdue' && row.count > 0}
            />
          ))}
        </div>

        <Button asChild variant="outline" size="sm" className="w-full">
          <Link to="/">
            <DollarSign className="h-4 w-4" />
            View invoices
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
