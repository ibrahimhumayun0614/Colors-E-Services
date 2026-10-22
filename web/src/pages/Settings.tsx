import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Camera,
  CheckCircle2,
  ChevronRight,
  Database,
  Download,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  Plus,
  Shield,
  Trash2,
  Upload,
  User,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api, type ExportFile, type ImportMode, type UserProfile } from '@/lib/api';
import { getLastLogin, getUserProfile, setUserProfile } from '@/lib/auth';
import { APP_NAME, SHOP_BILLING_DEFAULTS } from '@/lib/branding';
import {
  emptyBankAccount,
  resolveBankAccounts,
  sanitizeBankAccounts,
  type BankAccount,
} from '@/lib/bank-accounts';
import { clearProfileAvatar, setProfileAvatar, useProfileAvatar } from '@/lib/avatar';
import { syncProfileFromServer } from '@/lib/profile';
import { buildCsv, downloadCsv, CSV_ENTITY_LABELS, type CsvEntity } from '@/lib/csv';
import { CURRENCY_OPTIONS, currencyLabel } from '@/lib/services';
import { cn, getInitials } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/layout/PageHeader';

const APP_VERSION = '1.0.0';
const BUILD_NUMBER = '20250623.1';

type SectionId = 'connection' | 'security' | 'preferences' | 'data' | 'system';

const sections: { id: SectionId; label: string }[] = [
  { id: 'connection', label: 'Connection' },
  { id: 'security', label: 'Security' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'data', label: 'Data' },
  { id: 'system', label: 'System' },
];

/**
 * Drives a smooth, fake 0–100% progress for actions that don't expose real
 * progress events (a single API request). It eases toward ~92% while the work
 * runs, then `finish()` snaps it to 100% before clearing.
 */
function useFakeProgress() {
  const [progress, setProgress] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    if (timeout.current) {
      clearTimeout(timeout.current);
      timeout.current = null;
    }
  }, []);

  const start = useCallback(() => {
    clearTimers();
    setProgress(6);
    timer.current = setInterval(() => {
      setProgress((p) => {
        const cur = p ?? 6;
        if (cur >= 92) return cur;
        return Math.min(92, cur + Math.max(0.8, (92 - cur) * 0.09));
      });
    }, 150);
  }, [clearTimers]);

  const finish = useCallback(
    (onDone?: () => void) => {
      clearTimers();
      setProgress(100);
      timeout.current = setTimeout(() => {
        setProgress(null);
        onDone?.();
      }, 650);
    },
    [clearTimers]
  );

  const reset = useCallback(() => {
    clearTimers();
    setProgress(null);
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  return { progress, start, finish, reset };
}

function formatDateTime(date: Date | null) {
  if (!date) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function SettingRow({
  label,
  hint,
  children,
  onClick,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors',
        onClick && 'hover:bg-muted/40'
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </Wrapper>
  );
}

export function SettingsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [activeSection, setActiveSection] = useState<SectionId>('connection');
  const [lastLogin] = useState<Date | null>(() => getLastLogin());
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [loadDemoOpen, setLoadDemoOpen] = useState(false);
  const [removeDemoOpen, setRemoveDemoOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    company_name: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    payment_method: '',
    bank_accounts: [emptyBankAccount()] as BankAccount[],
  });
  const [exporting, setExporting] = useState(false);
  const [csvExporting, setCsvExporting] = useState(false);
  const [importFile, setImportFile] = useState<ExportFile | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const avatar = useProfileAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const { data: connection, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['auth-check'],
    queryFn: api.auth.check,
    retry: 1,
  });

  const isConnected = !isLoading && !isError && connection?.authenticated;

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const synced = await syncProfileFromServer();
      if (!synced) return getUserProfile();
      return synced;
    },
    placeholderData: getUserProfile,
  });

  const updateProfileMutation = useMutation({
    mutationFn: (
      data: Partial<
        Pick<
          UserProfile,
          | 'name'
          | 'email'
          | 'company_name'
          | 'phone'
          | 'address'
          | 'city'
          | 'state'
          | 'zip'
          | 'default_currency'
          | 'payment_method'
          | 'bank_accounts'
        >
      >
    ) => api.profile.update(data),
    onSuccess: (next) => {
      setUserProfile(next);
      queryClient.setQueryData(['profile'], next);
      queryClient.setQueryData(['profile', 'sidebar'], next);
      setEditOpen(false);
      toast.success('Profile updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateCurrencyMutation = useMutation({
    mutationFn: (default_currency: string) => api.profile.update({ default_currency }),
    onSuccess: (next) => {
      setUserProfile(next);
      queryClient.setQueryData(['profile'], next);
      queryClient.setQueryData(['profile', 'sidebar'], next);
      toast.success('Default currency updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data: demoStatus, isLoading: demoLoading } = useQuery({
    queryKey: ['demo-status'],
    queryFn: api.demo.status,
    enabled: isConnected,
  });

  useEffect(() => {
    if (isConnected) setLastSync(new Date());
  }, [isConnected]);

  async function handleTestConnection() {
    const result = await refetch();
    if (result.data?.authenticated) setLastSync(new Date());
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function openEditProfile() {
    const current = profile ?? getUserProfile();
    const accounts = resolveBankAccounts(current);
    setEditForm({
      name: current.name,
      email: current.email,
      company_name: current.company_name || SHOP_BILLING_DEFAULTS.company_name,
      phone: current.phone || SHOP_BILLING_DEFAULTS.phone || '',
      address: current.address || SHOP_BILLING_DEFAULTS.address || '',
      city: current.city || SHOP_BILLING_DEFAULTS.city || '',
      state: current.state || '',
      zip: current.zip || '',
      payment_method: current.payment_method || '',
      bank_accounts: accounts.length ? accounts.map((a) => ({ ...a })) : [emptyBankAccount()],
    });
    setEditOpen(true);
  }

  function updateBankAccount(index: number, patch: Partial<BankAccount>) {
    setEditForm((prev) => ({
      ...prev,
      bank_accounts: prev.bank_accounts.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  function addBankAccount() {
    setEditForm((prev) => ({
      ...prev,
      bank_accounts: [...prev.bank_accounts, emptyBankAccount()],
    }));
  }

  function removeBankAccount(index: number) {
    setEditForm((prev) => {
      const next = prev.bank_accounts.filter((_, i) => i !== index);
      return {
        ...prev,
        bank_accounts: next.length ? next : [emptyBankAccount()],
      };
    });
  }

  function handleSaveProfile() {
    if (!profile) return;
    updateProfileMutation.mutate({
      name: editForm.name.trim() || profile.name,
      email: editForm.email.trim() || profile.email,
      company_name: editForm.company_name.trim() || null,
      phone: editForm.phone.trim() || null,
      address: editForm.address.trim() || null,
      city: editForm.city.trim() || null,
      state: editForm.state.trim() || null,
      zip: editForm.zip.trim() || null,
      payment_method: editForm.payment_method.trim() || null,
      bank_accounts: sanitizeBankAccounts(editForm.bank_accounts),
    });
  }

  function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      return;
    }

    if (file.size > 750 * 1024) {
      toast.error('Please choose an image under 750 KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfileAvatar(reader.result);
        toast.success('Profile photo updated');
      }
    };
    reader.onerror = () => toast.error('Could not read the selected image');
    reader.readAsDataURL(file);
  }

  function handleRemoveAvatar() {
    clearProfileAvatar();
    toast.success('Profile photo removed');
  }

  const loadProgress = useFakeProgress();
  const removeProgress = useFakeProgress();

  const loadDemoMutation = useMutation({
    mutationFn: api.demo.load,
    onMutate: () => loadProgress.start(),
    onSuccess: (result) => {
      queryClient.invalidateQueries();
      toast.success(`Demo data loaded (${result.clientCount} sample clients)`);
      loadProgress.finish(() => setLoadDemoOpen(false));
    },
    onError: (err: Error) => {
      loadProgress.reset();
      toast.error(err.message);
    },
  });

  const removeDemoMutation = useMutation({
    mutationFn: api.demo.remove,
    onMutate: () => removeProgress.start(),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success('Demo data removed');
      removeProgress.finish(() => setRemoveDemoOpen(false));
    },
    onError: (err: Error) => {
      removeProgress.reset();
      toast.error(err.message);
    },
  });

  async function handleExport() {
    setExporting(true);
    try {
      const file = await api.data.export();
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `client-crm-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const total = Object.values(file.counts).reduce((sum, n) => sum + n, 0);
      toast.success(`Exported ${total} records`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function handleExportCsv(entity: CsvEntity) {
    setCsvExporting(true);
    try {
      const file = await api.data.export();
      const { csv, count } = buildCsv(file, entity);
      if (count === 0) {
        toast.error(`No ${CSV_ENTITY_LABELS[entity].toLowerCase()} to export`);
        return;
      }
      downloadCsv(`client-crm-${entity}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast.success(`Exported ${count} ${CSV_ENTITY_LABELS[entity].toLowerCase()} to CSV`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'CSV export failed');
    } finally {
      setCsvExporting(false);
    }
  }

  function handleSelectFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as ExportFile;
        if (!parsed?.data || typeof parsed.data !== 'object') {
          throw new Error('Unrecognized file format');
        }
        setImportFile(parsed);
        setImportMode('merge');
      } catch {
        toast.error(`Invalid backup file. Please choose a ${APP_NAME} export (.json).`);
      }
    };
    reader.onerror = () => toast.error('Could not read the selected file');
    reader.readAsText(file);
  }

  const importMutation = useMutation({
    mutationFn: ({ file, mode }: { file: ExportFile; mode: ImportMode }) =>
      api.data.import(file, mode),
    onSuccess: (result) => {
      queryClient.invalidateQueries();
      setImportFile(null);
      const total = Object.values(result.imported).reduce((sum, n) => sum + n, 0);
      toast.success(
        result.mode === 'replace'
          ? `Data restored — ${total} records imported`
          : `Imported ${total} records`
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function importSummary(file: ExportFile) {
    const c = file.counts ?? {};
    const parts = [
      [c.clients, 'clients'],
      [c.services, 'services'],
      [c.invoices, 'invoices'],
      [c.tasks, 'tasks'],
    ] as const;
    return parts
      .filter(([n]) => typeof n === 'number' && n > 0)
      .map(([n, label]) => `${n} ${label}`)
      .join(', ');
  }

  const displayProfile = profile ?? getUserProfile();

  return (
    <div className="mx-auto max-w-5xl space-y-8 page-stagger">
      <PageHeader title="Settings" description="Profile, security, and workspace configuration." />

      {/* Profile hero */}
      <div className="relative overflow-hidden rounded-2xl border bg-card shadow-sm premium-hover-lift">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.07] via-transparent to-muted/30" />
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary text-2xl font-bold text-primary-foreground shadow-md">
              {avatar ? (
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : profileLoading ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                getInitials(displayProfile.name)
              )}
            </div>
            <div>
              <p className="text-xl font-semibold tracking-tight">{displayProfile.name}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                {displayProfile.email}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-medium">
                  {displayProfile.role}
                </Badge>
                <span className="text-xs text-muted-foreground">Last login {formatDateTime(lastLogin)}</span>
              </div>
            </div>
          </div>
          <Button variant="outline" className="gap-2 self-start shadow-sm sm:self-center" onClick={openEditProfile}>
            <Pencil className="h-4 w-4" />
            Edit profile
          </Button>
        </div>
      </div>

      {/* Status strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div
          className={cn(
            'flex items-center gap-3 rounded-2xl border px-5 py-4 shadow-sm',
            isConnected ? 'border-emerald-200/70 bg-emerald-50/50 dark:border-emerald-900/30 dark:bg-emerald-950/20' : 'bg-card'
          )}
        >
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', isConnected ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground')}>
            {isConnected ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">API</p>
            <p className="text-sm font-semibold">{isLoading ? 'Checking…' : isConnected ? 'Connected' : 'Offline'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border bg-card px-5 py-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Session</p>
            <p className="text-sm font-semibold">{isConnected ? 'Active' : 'Inactive'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border bg-card px-5 py-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Version</p>
            <p className="text-sm font-semibold">v{APP_VERSION}</p>
          </div>
        </div>
      </div>

      {/* Main settings panel */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex gap-1 overflow-x-auto border-b bg-muted/20 p-2">
          {sections.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-all',
                activeSection === id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {activeSection === 'connection' && (
          <div className="divide-y">
            {isConnected && (
              <div className="flex items-center gap-3 bg-emerald-50/60 px-6 py-4 dark:bg-emerald-950/15">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </span>
                <div>
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">All systems operational</p>
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">Backend is reachable and authenticated.</p>
                </div>
              </div>
            )}
            <SettingRow label="Environment" hint="Deployment tier">
              <Badge variant="outline">Production</Badge>
            </SettingRow>
            <SettingRow label="Backend" hint="API runtime">
              <span className="text-sm font-medium">Cloudflare Workers</span>
            </SettingRow>
            <SettingRow label="Database" hint="Primary data store">
              <span className="text-sm font-medium">D1</span>
            </SettingRow>
            <SettingRow label="Last sync" hint="Most recent successful check">
              <span className="text-sm tabular-nums text-muted-foreground">{formatDateTime(lastSync)}</span>
            </SettingRow>
            <div className="px-6 py-5">
              <Button variant="outline" className="gap-2" onClick={handleTestConnection} disabled={isFetching}>
                <Activity className={cn('h-4 w-4', isFetching && 'animate-pulse')} />
                {isFetching ? 'Testing…' : 'Test connection'}
              </Button>
            </div>
          </div>
        )}

        {activeSection === 'security' && (
          <div className="divide-y">
            <SettingRow label="Password" hint="Managed via Cloudflare API_SECRET">
              <Badge variant="success">Active</Badge>
            </SettingRow>
            <SettingRow label="Current session" hint="This browser">
              <span className="text-sm">{isConnected ? 'Signed in' : 'Not signed in'}</span>
            </SettingRow>
            <SettingRow label="Last login">
              <span className="text-sm tabular-nums text-muted-foreground">{formatDateTime(lastLogin)}</span>
            </SettingRow>
            <SettingRow label="Change password" hint="Update your Cloudflare worker secret" onClick={() => setPasswordOpen(true)}>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </SettingRow>
            <div className="px-6 py-5">
              <Button
                variant="outline"
                className="gap-2 text-destructive hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </div>
          </div>
        )}

        {activeSection === 'preferences' && (
          <div className="divide-y">
            <div className="px-6 py-5">
              <p className="text-sm font-medium">Invoice billing address (From)</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Shown on new invoices as your shop letterhead. Edit via{' '}
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  onClick={openEditProfile}
                >
                  Edit profile
                </button>
                .
              </p>
              <div className="mt-3 rounded-xl border bg-muted/20 p-4 text-sm leading-relaxed">
                <p className="font-semibold">
                  {displayProfile.company_name || SHOP_BILLING_DEFAULTS.company_name}
                </p>
                <p className="text-muted-foreground">
                  {[
                    displayProfile.address || SHOP_BILLING_DEFAULTS.address,
                    displayProfile.city || SHOP_BILLING_DEFAULTS.city,
                    displayProfile.state,
                    displayProfile.zip,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                <p className="mt-2 text-muted-foreground">
                  Phone: {displayProfile.phone || SHOP_BILLING_DEFAULTS.phone}
                </p>
                <p className="text-muted-foreground">
                  Email: {displayProfile.email || SHOP_BILLING_DEFAULTS.email}
                </p>
              </div>
            </div>
            <SettingRow
              label="Default currency"
              hint="Used for new services and invoices. Existing records keep their own currency."
            >
              <Select
                value={displayProfile.default_currency || 'INR'}
                onValueChange={(value) => updateCurrencyMutation.mutate(value)}
                disabled={updateCurrencyMutation.isPending || !isConnected}
              >
                <SelectTrigger className="w-[11rem]" aria-label="Default currency">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
            <div className="px-6 py-4 text-sm text-muted-foreground">
              Current default:{' '}
              <span className="font-medium text-foreground">
                {currencyLabel(displayProfile.default_currency)}
              </span>
              . Changing this does not rewrite past invoices or services.
            </div>
          </div>
        )}

        {activeSection === 'data' && (
          <div className="divide-y">
            <div className="flex items-start gap-4 px-6 py-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                <Database className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">Demo workspace data</p>
                <p className="text-sm text-muted-foreground">
                  Load sample clients, services, invoices, and tasks to explore the CRM. Demo records use{' '}
                  <span className="font-mono text-xs">@demo.local</span> emails — your real data is never modified.
                </p>
              </div>
            </div>
            <SettingRow label="Demo data" hint="Sample records in your database">
              {demoLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : demoStatus?.loaded ? (
                <Badge variant="success">Loaded · {demoStatus.clientCount} clients</Badge>
              ) : (
                <Badge variant="secondary">Not loaded</Badge>
              )}
            </SettingRow>
            <SettingRow label="Your data" hint="Records you create manually">
              <span className="text-sm text-muted-foreground">Always kept separate</span>
            </SettingRow>
            <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row">
              <Button
                variant="outline"
                className="gap-2"
                disabled={!isConnected || demoLoading || loadDemoMutation.isPending || demoStatus?.loaded}
                onClick={() => setLoadDemoOpen(true)}
              >
                {loadDemoMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Database className="h-4 w-4" />
                )}
                Load demo data
              </Button>
              <Button
                variant="outline"
                className="gap-2 text-destructive hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
                disabled={!isConnected || demoLoading || removeDemoMutation.isPending || !demoStatus?.loaded}
                onClick={() => setRemoveDemoOpen(true)}
              >
                {removeDemoMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Remove demo data
              </Button>
            </div>

            <div className="flex items-start gap-4 px-6 py-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
                <Download className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">Backup &amp; restore</p>
                <p className="text-sm text-muted-foreground">
                  Export all your clients, services, invoices, and tasks to a JSON file you can keep
                  safe — then import it here to restore or move to another workspace. Use{' '}
                  <span className="font-medium">Export CSV</span> for spreadsheet-friendly copies.
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleSelectFile}
            />
            <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row">
              <Button
                variant="outline"
                className="gap-2"
                disabled={!isConnected || exporting}
                onClick={handleExport}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Export data
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                disabled={!isConnected || importMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                {importMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Import data
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2" disabled={!isConnected || csvExporting}>
                    {csvExporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Export CSV
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {(Object.keys(CSV_ENTITY_LABELS) as CsvEntity[]).map((entity) => (
                    <DropdownMenuItem key={entity} onSelect={() => handleExportCsv(entity)}>
                      {CSV_ENTITY_LABELS[entity]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        {activeSection === 'system' && (
          <div className="divide-y">
            <SettingRow label="Application" hint={APP_NAME}>
              <span className="text-sm font-medium">v{APP_VERSION}</span>
            </SettingRow>
            <SettingRow label="Build" hint="Release identifier">
              <span className="text-sm font-mono text-muted-foreground">{BUILD_NUMBER}</span>
            </SettingRow>
            <SettingRow label="Deployment" hint="CI/CD pipeline">
              <span className="text-sm">GitHub Actions</span>
            </SettingRow>
            <SettingRow label="Platform status">
              <Badge variant={isConnected ? 'success' : 'secondary'}>{isConnected ? 'Healthy' : 'Unknown'}</Badge>
            </SettingRow>
            <div className="px-6 py-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Stack</p>
              <div className="flex flex-wrap gap-2">
                {['React', 'Cloudflare Workers', 'D1', 'Pages'].map((tech) => (
                  <span key={tech} className="rounded-lg border bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              Edit profile
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFile}
            />
            <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3 sm:flex-row sm:items-center">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : getInitials(displayProfile.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Profile photo</p>
                <p className="text-xs text-muted-foreground">Stored locally in this browser.</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => avatarInputRef.current?.click()}>
                  <Camera className="h-3.5 w-3.5" />
                  Upload
                </Button>
                {avatar && (
                  <Button type="button" variant="ghost" size="sm" onClick={handleRemoveAvatar}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-company">Business name (invoice From)</Label>
              <Input
                id="profile-company"
                value={editForm.company_name}
                onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Contact name</Label>
                <Input
                  id="profile-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-email">Email</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-address">Street address</Label>
              <Input
                id="profile-address"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="profile-city">City / town</Label>
                <Input
                  id="profile-city"
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-state">State</Label>
                <Input
                  id="profile-state"
                  value={editForm.state}
                  onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-zip">PIN / ZIP</Label>
              <Input
                id="profile-zip"
                value={editForm.zip}
                onChange={(e) => setEditForm({ ...editForm, zip: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-payment-method">Default payment method</Label>
              <Input
                id="profile-payment-method"
                value={editForm.payment_method}
                onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value })}
                placeholder="EFT Bank Transfer / Cash / UPI"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Bank details</p>
                  <p className="text-xs text-muted-foreground">
                    Add two or more accounts — they appear on invoices.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addBankAccount}>
                  <Plus className="h-3.5 w-3.5" />
                  Add account
                </Button>
              </div>

              <div className="space-y-3">
                {editForm.bank_accounts.map((account, index) => (
                  <div key={index} className="space-y-3 rounded-xl border bg-muted/10 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Account {index + 1}
                        {index === 0 ? ' · Primary' : ''}
                      </p>
                      {editForm.bank_accounts.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-destructive hover:text-destructive"
                          onClick={() => removeBankAccount(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Label</Label>
                        <Input
                          value={account.label}
                          onChange={(e) => updateBankAccount(index, { label: e.target.value })}
                          placeholder={index === 0 ? 'Primary / Business' : 'USD / Personal'}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Account name</Label>
                        <Input
                          value={account.bank_account_name}
                          onChange={(e) =>
                            updateBankAccount(index, { bank_account_name: e.target.value })
                          }
                          placeholder="Account holder name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Account number</Label>
                        <Input
                          value={account.bank_account}
                          onChange={(e) => updateBankAccount(index, { bank_account: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Bank name</Label>
                        <Input
                          value={account.bank_name}
                          onChange={(e) => updateBankAccount(index, { bank_name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>IFSC / bank code</Label>
                        <Input
                          value={account.bank_ifsc}
                          onChange={(e) => updateBankAccount(index, { bank_ifsc: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>UPI ID</Label>
                        <Input
                          value={account.upi_id}
                          onChange={(e) => updateBankAccount(index, { upi_id: e.target.value })}
                          placeholder="name@bank"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button className="w-full" onClick={handleSaveProfile} disabled={updateProfileMutation.isPending}>
              {updateProfileMutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-muted-foreground" />
              Change password
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2 text-sm text-muted-foreground">
            <p>Update your password in Cloudflare:</p>
            <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
              <li>Workers & Pages → <strong>crm-app</strong></li>
              <li>Settings → Variables and Secrets</li>
              <li>Update <strong>API_SECRET</strong> and sign in again</li>
            </ol>
            <Button variant="outline" className="w-full" onClick={() => setPasswordOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={loadDemoOpen}
        onOpenChange={setLoadDemoOpen}
        title="Load demo data?"
        description="This adds 10 sample clients plus services, invoices, and tasks. Safe to remove later from this page. Your own records are not affected."
        confirmLabel="Load demo data"
        loading={loadDemoMutation.isPending || loadProgress.progress != null}
        progress={loadProgress.progress}
        progressLabel="Loading demo data…"
        onConfirm={() => loadDemoMutation.mutate()}
      />

      <ConfirmDialog
        open={removeDemoOpen}
        onOpenChange={setRemoveDemoOpen}
        title="Remove demo data?"
        description="All sample records with @demo.local emails will be deleted. Clients, services, invoices, and tasks you created yourself stay untouched."
        confirmLabel="Remove demo data"
        destructive
        loading={removeDemoMutation.isPending || removeProgress.progress != null}
        progress={removeProgress.progress}
        progressLabel="Removing demo data…"
        onConfirm={() => removeDemoMutation.mutate()}
      />

      <Dialog
        open={!!importFile}
        onOpenChange={(open) => {
          if (!open && !importMutation.isPending) setImportFile(null);
        }}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-muted-foreground" />
              Import data
            </DialogTitle>
          </DialogHeader>
          {importFile && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                <p className="font-medium">This file contains:</p>
                <p className="mt-1 text-muted-foreground">
                  {importSummary(importFile) || 'No records'}
                </p>
                {importFile.exported_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Exported {formatDateTime(new Date(importFile.exported_at))}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setImportMode('merge')}
                  className={cn(
                    'w-full rounded-lg border px-4 py-3 text-left transition-colors',
                    importMode === 'merge'
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/40'
                  )}
                >
                  <p className="text-sm font-medium">Merge (add to existing)</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Adds imported records alongside what you already have. New IDs are assigned, so
                    nothing is overwritten.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('replace')}
                  className={cn(
                    'w-full rounded-lg border px-4 py-3 text-left transition-colors',
                    importMode === 'replace'
                      ? 'border-destructive bg-destructive/5'
                      : 'hover:bg-muted/40'
                  )}
                >
                  <p className="text-sm font-medium text-destructive">Replace (restore backup)</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Deletes all current data first, then restores this file exactly. Use this for a
                    full backup restore.
                  </p>
                </button>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setImportFile(null)}
                  disabled={importMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant={importMode === 'replace' ? 'destructive' : 'default'}
                  onClick={() => importMutation.mutate({ file: importFile, mode: importMode })}
                  disabled={importMutation.isPending}
                  className="gap-2"
                >
                  {importMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {importMode === 'replace' ? 'Replace all data' : 'Import'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
