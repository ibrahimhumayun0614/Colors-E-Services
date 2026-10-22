import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ListTodo,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { api, type Client, type Task, type TaskPriority, type TaskStatus } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { useDebounce } from '@/hooks/useDebounce';
import { taskPriorityVariant } from '@/lib/status';
import {
  formatTaskPriority,
  isTaskDueToday,
  isTaskOverdue,
  taskDueState,
} from '@/lib/tasks';
import { cn, formatDate, getInitials } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { listStaggerStyle } from '@/components/layout/AnimatedPage';
import { EmptyState } from '@/components/layout/EmptyState';
import { SearchInput } from '@/components/SearchInput';
import { TableSkeleton } from '@/components/layout/Skeletons';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type StatusFilter = 'all' | 'open' | 'done' | 'overdue' | 'today';

const PAGE_SIZE = 10;

const statusChips: {
  value: StatusFilter;
  label: string;
  dot: string;
  activeClass: string;
}[] = [
  { value: 'all', label: 'All', dot: 'bg-foreground/60', activeClass: 'border-foreground/30 bg-foreground/5 text-foreground' },
  { value: 'open', label: 'Open', dot: 'bg-blue-500', activeClass: 'border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' },
  { value: 'today', label: 'Due today', dot: 'bg-amber-500', activeClass: 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' },
  { value: 'overdue', label: 'Overdue', dot: 'bg-red-500', activeClass: 'border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' },
  { value: 'done', label: 'Done', dot: 'bg-emerald-500', activeClass: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' },
];

const rowTint = {
  overdue: 'bg-red-50/70 hover:bg-red-50 dark:bg-red-950/20 dark:hover:bg-red-950/30',
  today: 'bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30',
  default: 'hover:bg-slate-50 dark:hover:bg-muted/50',
  done: 'opacity-60 hover:bg-muted/30',
};

function TaskStatCard({
  label,
  value,
  total,
  filter,
  active,
  onSelect,
  icon: Icon,
  styles,
}: {
  label: string;
  value: number;
  total: number;
  filter: StatusFilter;
  active: boolean;
  onSelect: (filter: StatusFilter) => void;
  icon: React.ElementType;
  styles: {
    bar: string;
    icon: string;
    active: string;
  };
}) {
  const share = total > 0 && filter !== 'all' ? Math.round((value / total) * 100) : 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(filter)}
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-card text-left transition-all duration-200',
        'premium-hover-lift',
        active ? cn('shadow-md ring-2 ring-offset-2 ring-offset-background', styles.active) : 'hover:border-border/80'
      )}
    >
      <div className={cn('absolute inset-y-0 left-0 w-1', styles.bar)} />
      <div className="flex items-center gap-3 p-4 pl-5">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105',
            styles.icon
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums tracking-tight">{value}</span>
            {filter !== 'all' && total > 0 && (
              <span className="text-xs text-muted-foreground/80">{share}%</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function TaskClientCell({
  client,
  clientName,
  clientId,
}: {
  client?: Client;
  clientName?: string | null;
  clientId: number;
}) {
  const name = client?.name ?? clientName ?? 'Unknown';
  const status = client?.status;

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {getInitials(name)}
        </div>
        {status && (
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card',
              status === 'active' && 'bg-emerald-500',
              status === 'lead' && 'bg-amber-500',
              status === 'inactive' && 'bg-slate-400'
            )}
            title={status}
          />
        )}
      </div>
      <div className="min-w-0">
        <Link to={`/clients/${clientId}`} className="block truncate font-medium hover:underline">
          {name}
        </Link>
        {client?.company && (
          <p className="truncate text-xs text-muted-foreground">{client.company}</p>
        )}
      </div>
    </div>
  );
}

function TaskForm({
  initial,
  clients,
  onSubmit,
  loading,
  submitLabel,
}: {
  initial?: Partial<Task>;
  clients: { id: number; name: string }[];
  onSubmit: (data: Partial<Task>) => void;
  loading?: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    due_date: initial?.due_date ?? '',
    priority: (initial?.priority ?? 'medium') as TaskPriority,
    client_id: initial?.client_id ? String(initial.client_id) : '',
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.title.trim()) return;
        onSubmit({
          title: form.title.trim(),
          description: form.description.trim() || null,
          due_date: form.due_date || null,
          priority: form.priority,
          client_id: form.client_id ? Number(form.client_id) : null,
        });
      }}
    >
      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="What needs to be done?"
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Optional details…"
          rows={3}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Due date</Label>
          <Input
            type="date"
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Priority</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Client</Label>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={form.client_id}
          onChange={(e) => setForm({ ...form, client_id: e.target.value })}
        >
          <option value="">No client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={loading || !form.title.trim()} className="w-full">
        {loading ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}

function AddTaskDialog({
  open,
  onOpenChange,
  clients,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: { id: number; name: string }[];
  onSubmit: (data: Partial<Task>) => void;
  loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="shrink-0">
          <Plus className="h-4 w-4" />
          Add Task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <TaskForm
          clients={clients}
          onSubmit={onSubmit}
          loading={loading}
          submitLabel="Create Task"
        />
      </DialogContent>
    </Dialog>
  );
}

export function TasksPage() {
  const [open, setOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [page, setPage] = useState(1);
  const [justCompleted, setJustCompleted] = useState<Set<number>>(new Set());
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const debouncedSearch = useDebounce(search);

  const { data: tasks = [], isLoading, isFetching } = useQuery({
    queryKey: ['tasks', debouncedSearch],
    queryFn: () => api.tasks.list(debouncedSearch ? { search: debouncedSearch } : undefined),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.clients.list(),
  });

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const stats = useMemo(() => {
    const openTasks = tasks.filter((t) => t.status === 'open');
    return {
      total: tasks.length,
      open: openTasks.length,
      today: openTasks.filter(isTaskDueToday).length,
      overdue: openTasks.filter(isTaskOverdue).length,
      done: tasks.filter((t) => t.status === 'done').length,
    };
  }, [tasks]);

  const summaryCards = [
    {
      label: 'Total tasks',
      value: stats.total,
      filter: 'all' as StatusFilter,
      icon: ListTodo,
      styles: {
        bar: 'bg-foreground/80',
        icon: 'bg-muted text-foreground',
        active: 'ring-foreground/20',
      },
    },
    {
      label: 'Open',
      value: stats.open,
      filter: 'open' as StatusFilter,
      icon: Circle,
      styles: {
        bar: 'bg-blue-500',
        icon: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
        active: 'ring-blue-500/30',
      },
    },
    {
      label: 'Due today',
      value: stats.today,
      filter: 'today' as StatusFilter,
      icon: CalendarClock,
      styles: {
        bar: 'bg-amber-500',
        icon: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
        active: 'ring-amber-500/30',
      },
    },
    {
      label: 'Overdue',
      value: stats.overdue,
      filter: 'overdue' as StatusFilter,
      icon: AlertCircle,
      styles: {
        bar: 'bg-red-500',
        icon: 'bg-red-500/10 text-red-700 dark:text-red-400',
        active: 'ring-red-500/30',
      },
    },
    {
      label: 'Done',
      value: stats.done,
      filter: 'done' as StatusFilter,
      icon: CheckCircle2,
      styles: {
        bar: 'bg-emerald-500',
        icon: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        active: 'ring-emerald-500/30',
      },
    },
  ];

  const filtered = useMemo(() => {
    return tasks.filter((task) => {
      if (statusFilter === 'open') return task.status === 'open';
      if (statusFilter === 'done') return task.status === 'done';
      if (statusFilter === 'overdue') return isTaskOverdue(task);
      if (statusFilter === 'today') return isTaskDueToday(task);
      return true;
    });
  }, [tasks, statusFilter]);

  const filterCounts = useMemo(
    () => ({
      all: tasks.length,
      open: stats.open,
      today: stats.today,
      overdue: stats.overdue,
      done: stats.done,
    }),
    [tasks.length, stats]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const searching = search !== debouncedSearch || (isFetching && !!debouncedSearch);
  const hasFilters = search.length > 0 || statusFilter !== 'all';

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['services'] });
  };

  const createMutation = useMutation({
    mutationFn: api.tasks.create,
    onSuccess: (task) => {
      invalidate();
      setOpen(false);
      setHighlightId(task.id);
      window.setTimeout(() => setHighlightId(null), 900);
      toast.success('Task created');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Task> }) => api.tasks.update(id, data),
    onSuccess: () => {
      invalidate();
      setEditTask(null);
      toast.success('Task updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TaskStatus }) =>
      api.tasks.updateStatus(id, status),
    onSuccess: (_data, vars) => {
      invalidate();
      toast.success(
        vars.status === 'done'
          ? 'Task completed — linked service dates updated when applicable'
          : 'Task reopened'
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: api.tasks.delete,
    onSuccess: () => {
      invalidate();
      setDeleteTask(null);
      toast.success('Task deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleToggleStatus(task: Task) {
    const nextStatus: TaskStatus = task.status === 'done' ? 'open' : 'done';
    if (nextStatus === 'done') {
      setJustCompleted((prev) => new Set(prev).add(task.id));
      window.setTimeout(() => {
        setJustCompleted((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }, 700);
    }
    statusMutation.mutate({ id: task.id, status: nextStatus });
  }

  function resetFilters() {
    setSearch('');
    setStatusFilter('all');
  }

  function rowClass(task: Task) {
    if (task.status === 'done') return rowTint.done;
    if (isTaskOverdue(task)) return rowTint.overdue;
    if (isTaskDueToday(task)) return rowTint.today;
    return rowTint.default;
  }

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader
        title="Tasks"
        description="Track follow-ups, renewals, and client work in one place."
        meta={
          !isLoading && tasks.length > 0
            ? `${stats.open} open · ${stats.overdue} overdue · ${stats.done} done`
            : undefined
        }
      />

      {!isLoading && tasks.length > 0 && (
        <div className="page-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map((card) => (
            <TaskStatCard
              key={card.filter}
              label={card.label}
              value={card.value}
              total={stats.total}
              filter={card.filter}
              active={statusFilter === card.filter}
              onSelect={setStatusFilter}
              icon={card.icon}
              styles={card.styles}
            />
          ))}
        </div>
      )}

      {stats.overdue > 0 && !isLoading && tasks.length > 0 && (
        <div className="dashboard-slide-down flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20 sm:flex-row sm:items-center">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-red-800 dark:text-red-300">Overdue tasks need attention</p>
            <p className="text-sm text-red-700/90 dark:text-red-300/80">
              {stats.overdue} task{stats.overdue !== 1 ? 's' : ''} past due date
            </p>
          </div>
          <Button
            variant="outline"
            className="shrink-0 border-red-300 bg-white text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-transparent dark:text-red-300"
            onClick={() => setStatusFilter('overdue')}
          >
            Review Now
          </Button>
        </div>
      )}

      {!isLoading && (
        <div className="space-y-3 rounded-xl border bg-card p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search tasks, clients…"
              loading={searching}
              className="max-w-none flex-1"
            />
            <AddTaskDialog
              open={open}
              onOpenChange={setOpen}
              clients={clients}
              onSubmit={(data) => createMutation.mutate(data)}
              loading={createMutation.isPending}
            />
          </div>

          {tasks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {statusChips.map((chip) => {
                const count = filterCounts[chip.value];
                const active = statusFilter === chip.value;
                return (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => setStatusFilter(chip.value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200',
                      active ? chip.activeClass : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    <span className={cn('h-2 w-2 rounded-full', chip.dot)} />
                    {chip.label}
                    <span className={cn('tabular-nums', active ? '' : 'text-muted-foreground/70')}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : tasks.length === 0 && !search ? (
        <EmptyState
          icon={ListTodo}
          title="No tasks yet"
          description="Create a task to track client follow-ups and internal work."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Add your first task
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="No tasks match"
          description="Try adjusting your search or filter."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {hasFilters && (
                <Button variant="outline" onClick={resetFilters}>
                  Clear filters
                </Button>
              )}
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Task
              </Button>
            </div>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table containerClassName="max-h-[min(70vh,720px)]">
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky top-0 z-10 w-12 bg-card text-right font-medium text-muted-foreground">
                  #
                </TableHead>
                <TableHead className="w-10" />
                <TableHead className="font-medium text-muted-foreground">Task</TableHead>
                <TableHead className="hidden font-medium text-muted-foreground md:table-cell">Client</TableHead>
                <TableHead className="font-medium text-muted-foreground">Due</TableHead>
                <TableHead className="hidden font-medium text-muted-foreground sm:table-cell">Priority</TableHead>
                <TableHead className="w-12 text-right font-medium text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((task, index) => {
                const due = taskDueState(task);
                const done = task.status === 'done';
                const client = task.client_id ? clientMap.get(task.client_id) : undefined;

                return (
                  <TableRow
                    key={task.id}
                    style={listStaggerStyle(index)}
                    className={cn(
                      'list-item-enter transition-colors duration-200',
                      rowClass(task),
                      justCompleted.has(task.id) && 'animate-task-complete',
                      highlightId === task.id && 'animate-task-new'
                    )}
                  >
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {pageStart + index + 1}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="rounded-full text-muted-foreground transition-all duration-200 hover:scale-110 hover:text-primary active:scale-95"
                        aria-label={done ? 'Mark as open' : 'Mark as done'}
                        onClick={() => handleToggleStatus(task)}
                      >
                        {done ? (
                          <CheckCircle2
                            className={cn(
                              'h-5 w-5 text-emerald-600 dark:text-emerald-400',
                              justCompleted.has(task.id) && 'animate-check-pop'
                            )}
                          />
                        ) : (
                          <Circle className="h-5 w-5" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0 space-y-1">
                        <p
                          className={cn(
                            'font-medium leading-tight',
                            done && 'text-muted-foreground line-through'
                          )}
                        >
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="line-clamp-1 text-xs text-muted-foreground">{task.description}</p>
                        )}
                        {task.client_id && (
                          <div className="pt-0.5 md:hidden">
                            <TaskClientCell
                              client={client}
                              clientName={task.client_name}
                              clientId={task.client_id}
                            />
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-1 pt-0.5 sm:hidden">
                          <Badge variant={taskPriorityVariant[task.priority]} className="text-[10px]">
                            {formatTaskPriority(task.priority)}
                          </Badge>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {task.client_id ? (
                        <TaskClientCell
                          client={client}
                          clientName={task.client_name}
                          clientId={task.client_id}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-sm">{formatDate(task.due_date)}</p>
                        <Badge variant={due.variant}>{due.label}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant={taskPriorityVariant[task.priority]}>
                        {formatTaskPriority(task.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditTask(task)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTask(task)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {filtered.length > PAGE_SIZE && (
            <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row">
              <p className="text-sm text-muted-foreground">
                Showing{' '}
                <span className="font-medium text-foreground">{pageStart + 1}</span>
                {'–'}
                <span className="font-medium text-foreground">
                  {Math.min(pageStart + PAGE_SIZE, filtered.length)}
                </span>{' '}
                of <span className="font-medium text-foreground">{filtered.length}</span>
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Button
                    key={p}
                    variant={p === page ? 'default' : 'outline'}
                    size="sm"
                    className="min-w-9"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!editTask} onOpenChange={(v) => !v && setEditTask(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
          </DialogHeader>
          {editTask && (
            <TaskForm
              key={editTask.id}
              initial={editTask}
              clients={clients}
              onSubmit={(data) => updateMutation.mutate({ id: editTask.id, data })}
              loading={updateMutation.isPending}
              submitLabel="Save changes"
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTask}
        onOpenChange={(v) => !v && setDeleteTask(null)}
        title="Delete task?"
        description={`"${deleteTask?.title}" will be permanently removed.`}
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTask && deleteMutation.mutate(deleteTask.id)}
      />
    </div>
  );
}
