import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Clock3, FileText, Loader2, Package, Search, Users, type LucideIcon } from 'lucide-react';
import { api, type Client, type Invoice } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import { resolveCurrency } from '@/lib/services';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const RECENT_SEARCHES_KEY = 'crm_recent_searches';

type SearchResult = {
  id: string;
  type: 'Client' | 'Invoice';
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

type QuickAction = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

interface GlobalSearchProps {
  compact?: boolean;
}

const quickActions: QuickAction[] = [
  {
    id: 'add-client',
    title: 'Add client',
    description: 'Create a new client record',
    href: '/clients?new=1',
    icon: Users,
  },
  {
    id: 'create-invoice',
    title: 'Create invoice',
    description: 'Draft a new invoice',
    href: '/?new=1',
    icon: FileText,
  },
  {
    id: 'add-product',
    title: 'Manage products',
    description: 'Catalog and pricing',
    href: '/products',
    icon: Package,
  },
];

function includesQuery(value: string | number | null | undefined, query: string) {
  return String(value ?? '').toLowerCase().includes(query);
}

function getRecentSearches(): string[] {
  try {
    const value = localStorage.getItem(RECENT_SEARCHES_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(term: string) {
  const clean = term.trim();
  if (clean.length < 2) return;
  const next = [clean, ...getRecentSearches().filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(0, 5);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
}

function resultFromClient(client: Client): SearchResult {
  return {
    id: `client-${client.id}`,
    type: 'Client',
    title: client.name,
    description: [client.company, client.email].filter(Boolean).join(' - ') || client.status,
    href: `/clients/${client.id}`,
    icon: Users,
  };
}

function resultFromInvoice(invoice: Invoice): SearchResult {
  return {
    id: `invoice-${invoice.id}`,
    type: 'Invoice',
    title: invoice.invoice_number,
    description: `${invoice.client_name ?? 'Client'} - ${formatCurrency(invoice.total ?? 0, resolveCurrency(invoice.currency))} - Due ${formatDate(invoice.due_date)}`,
    href: '/',
    icon: FileText,
  };
}

export function GlobalSearch({ compact = false }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => getRecentSearches());
  const debouncedQuery = useDebounce(query.trim(), 250);
  const navigate = useNavigate();

  const canSearch = debouncedQuery.length >= 2;

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        const isDesktop = window.matchMedia('(min-width: 768px)').matches;
        if ((compact && isDesktop) || (!compact && !isDesktop)) return;
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [compact]);

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', debouncedQuery],
    enabled: open && canSearch,
    queryFn: async () => {
      const [clients, invoices] = await Promise.all([
        api.clients.list({ search: debouncedQuery }),
        api.invoices.list(),
      ]);

      const q = debouncedQuery.toLowerCase();
      return {
        clients,
        invoices: invoices.filter((invoice) =>
          [invoice.invoice_number, invoice.client_name, invoice.status, invoice.total].some((value) =>
            includesQuery(value, q)
          )
        ),
      };
    },
  });

  const results = useMemo<SearchResult[]>(() => {
    if (!data) return [];

    return [
      ...data.clients.slice(0, 6).map(resultFromClient),
      ...data.invoices.slice(0, 6).map(resultFromInvoice),
    ].slice(0, 12);
  }, [data]);

  function closeAndNavigate(href: string) {
    if (query.trim()) {
      saveRecentSearch(query);
      setRecentSearches(getRecentSearches());
    }
    setOpen(false);
    setQuery('');
    navigate(href);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) setRecentSearches(getRecentSearches());
  }

  function handleSubmit() {
    if (results[0]) closeAndNavigate(results[0].href);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={compact ? 'icon' : 'sm'}
        className={cn(!compact && 'w-full justify-between gap-2 text-muted-foreground')}
        onClick={() => setOpen(true)}
        aria-label="Open command search"
        title="Search"
      >
        <span className="flex items-center gap-2">
          <Search className="h-4 w-4" />
          {!compact && <span>Search</span>}
        </span>
        {!compact && <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium">Ctrl K</kbd>}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="gap-3 p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-5 pb-3 pt-5">
            <DialogTitle>Command search</DialogTitle>
            <DialogDescription>Search records or jump straight into common actions.</DialogDescription>
          </DialogHeader>

          <div className="px-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSubmit();
                }}
                placeholder="Search or run a command"
                className="h-11 pl-9"
              />
            </div>
          </div>

          <div className="max-h-[460px] overflow-y-auto px-2 pb-3">
            {!canSearch && (
              <div className="space-y-4 px-3 py-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick actions</p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {quickActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <button
                          key={action.id}
                          type="button"
                          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => closeAndNavigate(action.href)}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{action.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">{action.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {recentSearches.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent searches</p>
                    <div className="space-y-1">
                      {recentSearches.map((term) => (
                        <button
                          key={term}
                          type="button"
                          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setQuery(term)}
                        >
                          <Clock3 className="h-4 w-4 text-muted-foreground" />
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {canSearch && isFetching ? (
              <div className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </div>
            ) : canSearch && results.length === 0 ? (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                No matching records found.
              </div>
            ) : canSearch ? (
              <div className="space-y-1">
                {results.map((result) => {
                  const Icon = result.icon;
                  return (
                    <button
                      key={result.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => closeAndNavigate(result.href)}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{result.title}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                            {result.type}
                          </span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {result.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}