import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, DollarSign, Loader2, type LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { resolveCurrency } from '@/lib/services';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type NotificationItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  tone: 'warning' | 'destructive';
};

export function NotificationsPanel() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.dashboard,
  });

  const items = useMemo<NotificationItem[]>(() => {
    if (!data) return [];

    return data.overdueInvoices.slice(0, 8).map((invoice) => ({
      id: `invoice-${invoice.id}`,
      title: invoice.invoice_number,
      description: `${invoice.client_name} - ${formatCurrency(invoice.total ?? 0, resolveCurrency(invoice.currency))} overdue`,
      href: '/',
      icon: DollarSign,
      tone: 'destructive' as const,
    }));
  }, [data]);

  const count = items.length;
  const attentionSummary =
    count > 0
      ? `${count} overdue invoice${count !== 1 ? 's' : ''}`
      : 'No overdue invoices';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Open notifications"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-2">
        <div className="flex items-center justify-between px-2 py-2">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">{attentionSummary}</p>
          </div>
          {count > 0 && <Badge variant="destructive">{count}</Badge>}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : items.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <Bell className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">Nothing urgent</p>
            <p className="mt-1 text-xs text-muted-foreground">No overdue invoices, tasks, or renewals.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.id}
                  className="items-start gap-3 p-2"
                  onSelect={() => navigate(item.href)}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon
                      className={
                        item.tone === 'destructive'
                          ? 'h-4 w-4 text-destructive'
                          : 'h-4 w-4 text-amber-600'
                      }
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}

        {items.length > 0 && (
          <DropdownMenuItem className="mt-1 justify-center text-xs font-medium" onSelect={() => navigate('/')}>
            View invoices
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
