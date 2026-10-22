import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, FileText, Plus, TrendingUp, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, type Invoice } from '@/lib/api';
import { APP_NAME, APP_TAGLINE } from '@/lib/branding';
import { effectiveInvoiceStatus } from '@/lib/invoices';
import { resolveCurrency } from '@/lib/services';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { useCountUp } from '@/hooks/useCountUp';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { DashboardSkeleton } from '@/components/layout/Skeletons';
import { MotionLift } from '@/components/layout/Motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { invoiceStatusVariant, formatInvoiceStatus } from '@/lib/status';

type AmountTotals = {
  currency: string;
  total: number;
  paid: number;
  outstanding: number;
};

function sumByCurrency(invoices: Invoice[]): AmountTotals[] {
  const map = new Map<string, AmountTotals>();

  for (const inv of invoices) {
    const currency = resolveCurrency(inv.currency);
    const entry = map.get(currency) ?? { currency, total: 0, paid: 0, outstanding: 0 };
    const amount = inv.total ?? 0;
    entry.total += amount;
    const status = effectiveInvoiceStatus(inv);
    if (status === 'paid') entry.paid += amount;
    if (status === 'sent' || status === 'overdue') entry.outstanding += amount;
    map.set(currency, entry);
  }

  return [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

function formatAmountLines(rows: AmountTotals[], key: keyof Pick<AmountTotals, 'total' | 'paid' | 'outstanding'>) {
  const parts = rows.filter((r) => r[key] > 0).map((r) => formatCurrency(r[key], r.currency));
  return parts.length ? parts.join(' · ') : '—';
}

function StatCard({
  title,
  value,
  detail,
  icon: Icon,
  highlight,
  delay = 0,
}: {
  title: string;
  value: number;
  detail: string;
  icon: React.ElementType;
  highlight?: 'warning' | 'destructive';
  delay?: number;
}) {
  const animated = useCountUp(value);

  return (
    <MotionLift>
      <Card
        className={cn(
          'stat-card-hover overflow-hidden dashboard-fade-in',
          highlight === 'destructive' && 'border-destructive/30 bg-destructive/5',
          highlight === 'warning' && 'border-amber-500/30 bg-amber-500/5'
        )}
        style={{ animationDelay: `${delay}ms` }}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="text-2xl font-bold tabular-nums">{animated}</div>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </CardContent>
      </Card>
    </MotionLift>
  );
}

function AmountCard({
  title,
  amounts,
  icon: Icon,
  delay = 0,
}: {
  title: string;
  amounts: string;
  icon: React.ElementType;
  delay?: number;
}) {
  return (
    <MotionLift>
      <Card className="stat-card-hover overflow-hidden dashboard-fade-in" style={{ animationDelay: `${delay}ms` }}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="text-lg font-bold leading-snug tabular-nums sm:text-xl">{amounts}</div>
        </CardContent>
      </Card>
    </MotionLift>
  );
}

export function DashboardPage() {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.invoices.list(),
  });

  const metrics = useMemo(() => {
    const byCurrency = sumByCurrency(invoices);
    const statusCounts = invoices.reduce(
      (acc, inv) => {
        const status = effectiveInvoiceStatus(inv);
        acc[status] = (acc[status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const overdueCount = statusCounts.overdue ?? 0;
    const paidCount = statusCounts.paid ?? 0;

    const recent = [...invoices]
      .sort((a, b) => b.issue_date.localeCompare(a.issue_date) || b.id - a.id)
      .slice(0, 8);

    return {
      byCurrency,
      statusCounts,
      overdueCount,
      paidCount,
      recent,
      totalCount: invoices.length,
    };
  }, [invoices]);

  if (isLoading) return <DashboardSkeleton />;

  const totalAmountLabel = formatAmountLines(metrics.byCurrency, 'total');
  const paidAmountLabel = formatAmountLines(metrics.byCurrency, 'paid');
  const outstandingLabel = formatAmountLines(metrics.byCurrency, 'outstanding');

  const statusOrder = ['draft', 'sent', 'overdue', 'paid', 'cancelled'] as const;

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader
        title="Dashboard"
        description={`${APP_NAME} — ${APP_TAGLINE} at a glance.`}
        action={
          <Button asChild>
            <Link to="/?new=1">
              <Plus className="h-4 w-4" />
              New invoice
            </Link>
          </Button>
        }
      />

      {metrics.totalCount === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description="Create your first invoice to see counts and amounts here."
          action={
            <Button asChild>
              <Link to="/?new=1">Create invoice</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Invoices created"
              value={metrics.totalCount}
              detail="All invoices in your history"
              icon={FileText}
              delay={0}
            />
            <StatCard
              title="Paid"
              value={metrics.paidCount}
              detail="Marked as paid"
              icon={TrendingUp}
              delay={60}
            />
            <StatCard
              title="Overdue"
              value={metrics.overdueCount}
              detail="Past due and unpaid"
              icon={Wallet}
              highlight={metrics.overdueCount > 0 ? 'destructive' : undefined}
              delay={120}
            />
            <StatCard
              title="Drafts"
              value={metrics.statusCounts.draft ?? 0}
              detail="Not sent yet"
              icon={FileText}
              delay={180}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <AmountCard title="Total billed" amounts={totalAmountLabel} icon={DollarSign} delay={200} />
            <AmountCard title="Collected" amounts={paidAmountLabel} icon={TrendingUp} delay={240} />
            <AmountCard
              title="Outstanding"
              amounts={outstandingLabel}
              icon={Wallet}
              delay={280}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By status</CardTitle>
                <CardDescription>How your invoices are distributed</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {statusOrder.map((status) => {
                  const count = metrics.statusCounts[status] ?? 0;
                  if (count === 0 && status === 'cancelled') return null;
                  const pct = metrics.totalCount ? Math.round((count / metrics.totalCount) * 100) : 0;
                  return (
                    <div key={status} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <Badge variant={invoiceStatusVariant[status]}>{formatInvoiceStatus(status)}</Badge>
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Recent invoices</CardTitle>
                  <CardDescription>Latest created in the system</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/">View all</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {metrics.recent.map((inv) => {
                  const status = effectiveInvoiceStatus(inv);
                  const currency = resolveCurrency(inv.currency);
                  return (
                    <Link
                      key={inv.id}
                      to="/"
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-accent/60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{inv.invoice_number}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {inv.client_name ?? 'Client'} · {formatDate(inv.issue_date)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums">
                          {formatCurrency(inv.total ?? 0, currency)}
                        </span>
                        <Badge variant={invoiceStatusVariant[status]} className="mt-0.5 text-[10px]">
                          {formatInvoiceStatus(status)}
                        </Badge>
                      </span>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
