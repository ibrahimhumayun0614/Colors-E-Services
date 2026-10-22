import { clearSession, getSessionToken } from '@/lib/auth';
import type { BankAccount } from '@/lib/bank-accounts';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

type RequestOptions = RequestInit & { skipAuth?: boolean };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (!options.skipAuth) {
    const token = getSessionToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && !options.skipAuth) {
    clearSession();
    window.location.href = '/login?expired=1';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }

  return res.json();
}

export const api = {
  auth: {
    login: (password: string, remember: boolean) =>
      request<{ ok: boolean; token: string; expiresIn: number }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password, remember }),
        skipAuth: true,
      }),
    check: () => request<{ authenticated: boolean }>('/auth/check'),
  },
  profile: {
    get: () => request<UserProfile>('/profile'),
    update: (data: Partial<UserProfile>) =>
      request<UserProfile>('/profile', { method: 'PUT', body: JSON.stringify(data) }),
  },
  dashboard: () => request<DashboardData>('/dashboard'),
  products: {
    list: (params?: { search?: string; active?: '0' | '1' }) => {
      const q = new URLSearchParams(
        Object.fromEntries(
          Object.entries(params ?? {})
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => [k, String(v)])
        )
      ).toString();
      return request<Product[]>(`/products${q ? `?${q}` : ''}`);
    },
    get: (id: number) => request<Product>(`/products/${id}`),
    create: (data: Partial<Product>) =>
      request<Product>('/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Product>) =>
      request<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<{ ok: boolean }>(`/products/${id}`, { method: 'DELETE' }),
  },
  clients: {
    list: (params?: { status?: string; search?: string }) => {
      const q = new URLSearchParams(params as Record<string, string>).toString();
      return request<Client[]>(`/clients${q ? `?${q}` : ''}`);
    },
    get: (id: number) => request<Client>(`/clients/${id}`),
    create: (data: Partial<Client>) =>
      request<Client>('/clients', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Client>) =>
      request<Client>(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<{ ok: boolean }>(`/clients/${id}`, { method: 'DELETE' }),
  },
  services: {
    list: (params?: { client_id?: number; service_type?: string; expiring_days?: number }) => {
      const q = new URLSearchParams(
        Object.fromEntries(
          Object.entries(params ?? {})
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => [k, String(v)])
        )
      ).toString();
      return request<Service[]>(`/services${q ? `?${q}` : ''}`);
    },
    get: (id: number) => request<Service>(`/services/${id}`),
    create: (data: Partial<Service>) =>
      request<Service>('/services', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Service>) =>
      request<Service>(`/services/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<{ ok: boolean }>(`/services/${id}`, { method: 'DELETE' }),
    renew: (
      id: number,
      data?: { target?: 'domain' | 'hosting' | 'maintenance' | 'all'; years?: number; complete_tasks?: boolean }
    ) => request<Service>(`/services/${id}/renew`, { method: 'POST', body: JSON.stringify(data ?? {}) }),
    completeMaintenance: (id: number, data?: { complete_tasks?: boolean }) =>
      request<Service>(`/services/${id}/complete-maintenance`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
      }),
    createTask: (
      id: number,
      data?: {
        target?: 'domain' | 'hosting' | 'maintenance' | 'all';
        title?: string;
        due_date?: string;
        priority?: TaskPriority;
      }
    ) =>
      request<{ task: Task; existing: boolean }>(`/services/${id}/create-task`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
      }),
    createInvoice: (id: number, data?: { due_days?: number; status?: InvoiceStatus }) =>
      request<Invoice & { existing?: boolean }>(`/services/${id}/create-invoice`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
      }),
  },
  /** @deprecated Prefer api.services */
  websites: {
    list: (params?: { client_id?: number; expiring_days?: number }) => {
      const q = new URLSearchParams(
        Object.fromEntries(
          Object.entries(params ?? {}).map(([k, v]) => [k, String(v)])
        )
      ).toString();
      return request<Website[]>(`/websites${q ? `?${q}` : ''}`);
    },
    create: (data: Partial<Website>) =>
      request<Website>('/websites', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Website>) =>
      request<Website>(`/websites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<{ ok: boolean }>(`/websites/${id}`, { method: 'DELETE' }),
  },
  invoices: {
    list: (params?: { status?: string; client_id?: number }) => {
      const q = new URLSearchParams(params as Record<string, string>).toString();
      return request<Invoice[]>(`/invoices${q ? `?${q}` : ''}`);
    },
    nextNumber: () => request<{ invoice_number: string }>('/invoices/next-number'),
    get: (id: number) => request<Invoice>(`/invoices/${id}`),
    create: (data: CreateInvoicePayload) =>
      request<Invoice>('/invoices', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: UpdateInvoicePayload) =>
      request<Invoice>(`/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updateStatus: (id: number, status: string) =>
      request<Invoice>(`/invoices/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    share: (id: number) => request<{ url: string; token: string }>(`/invoices/${id}/share`),
    delete: (id: number) => request<{ ok: boolean }>(`/invoices/${id}`, { method: 'DELETE' }),
  },
  tasks: {
    list: (params?: { status?: string; client_id?: number; overdue?: string; search?: string }) => {
      const q = new URLSearchParams(
        Object.fromEntries(
          Object.entries(params ?? {})
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => [k, String(v)])
        )
      ).toString();
      return request<Task[]>(`/tasks${q ? `?${q}` : ''}`);
    },
    get: (id: number) => request<Task>(`/tasks/${id}`),
    create: (data: Partial<Task>) =>
      request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Task>) =>
      request<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updateStatus: (id: number, status: TaskStatus) =>
      request<Task>(`/tasks/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    delete: (id: number) => request<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
  },
  demo: {
    status: () => request<DemoDataStatus>('/demo/status'),
    load: () => request<DemoDataActionResult>('/demo/load', { method: 'POST' }),
    remove: () => request<DemoDataActionResult>('/demo', { method: 'DELETE' }),
  },
  data: {
    export: () => request<ExportFile>('/data/export'),
    import: (file: ExportFile, mode: ImportMode) =>
      request<ImportResult>('/data/import', {
        method: 'POST',
        body: JSON.stringify({ mode, version: file.version, data: file.data }),
      }),
  },
};

export type ClientStatus = 'active' | 'inactive' | 'lead';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'open' | 'done';

export interface UserProfile {
  name: string;
  email: string;
  role: string;
  default_currency: string;
  company_name?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  tax_id?: string | null;
  logo_data?: string | null;
  website?: string | null;
  bank_account?: string | null;
  bank_name?: string | null;
  bank_ifsc?: string | null;
  bank_account_name?: string | null;
  upi_id?: string | null;
  payment_method?: string | null;
  bank_accounts?: BankAccount[] | null;
}

export interface Product {
  id: number;
  serial_number: string | null;
  name: string;
  description: string | null;
  sku: string | null;
  unit_price: number;
  currency: string;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  status: ClientStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ServiceType =
  | 'domain_hosting'
  | 'website_maintenance'
  | 'logo_design'
  | 'content_writing'
  | 'email_configuration';
export type ServiceStatus = 'lead' | 'active' | 'paused' | 'completed';
export type BillingCycle = 'one_time' | 'monthly' | 'quarterly' | 'annual' | 'none';

export interface Service {
  id: number;
  client_id: number;
  service_type: ServiceType;
  name: string;
  status: ServiceStatus;
  billing_cycle: BillingCycle;
  amount: number;
  currency?: string;
  start_date: string | null;
  end_date: string | null;
  next_due_date: string | null;
  url: string | null;
  registrar: string | null;
  domain_expiry: string | null;
  hosting_provider: string | null;
  hosting_expiry: string | null;
  cms: string | null;
  email_provider: string | null;
  email_accounts: string | null;
  deliverables: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  client_name?: string;
}

/** @deprecated Use Service — legacy shape with monthly_cost */
export interface Website extends Omit<Service, 'service_type' | 'status' | 'billing_cycle' | 'amount'> {
  service_type?: ServiceType;
  monthly_cost: number;
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  service_id?: number | null;
  description: string;
  quantity: number;
  rate: number;
}

export interface Invoice {
  id: number;
  client_id: number;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  tax_rate: number;
  currency?: string;
  notes: string | null;
  /** Index into workspace profile bank_accounts (0 = Primary, 1 = Personal, …). */
  bank_account_index?: number | null;
  /** Snapshot of the bank account shown on this invoice. */
  payment_account?: BankAccount | string | null;
  client_name?: string;
  items?: InvoiceItem[];
  subtotal?: number;
  total?: number;
}

export interface CreateInvoicePayload {
  client_id: number;
  invoice_number?: string;
  issue_date: string;
  due_date: string;
  status?: InvoiceStatus;
  tax_rate?: number;
  currency?: string;
  notes?: string;
  bank_account_index?: number;
  payment_account?: BankAccount | null;
  items: { description: string; quantity: number; rate: number; service_id?: number | null }[];
}

export interface UpdateInvoicePayload {
  issue_date: string;
  due_date: string;
  tax_rate?: number;
  currency?: string;
  notes?: string | null;
  bank_account_index?: number;
  payment_account?: BankAccount | null;
  items: { description: string; quantity: number; rate: number; service_id?: number | null }[];
}

export interface Task {
  id: number;
  client_id: number | null;
  service_id?: number | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  client_name?: string | null;
}

export interface DemoDataStatus {
  loaded: boolean;
  clientCount: number;
}

export interface DemoDataActionResult extends DemoDataStatus {
  ok: boolean;
}

export type ImportMode = 'merge' | 'replace';

export interface ExportFile {
  version: number;
  exported_at: string;
  app: string;
  counts: Record<string, number>;
  data: {
    clients: Client[];
    services: Service[];
    invoices: Invoice[];
    invoice_items: InvoiceItem[];
    tasks: Task[];
  };
}

export interface ImportResult {
  ok: boolean;
  mode: ImportMode;
  imported: {
    clients: number;
    services: number;
    invoices: number;
    invoice_items: number;
    tasks: number;
  };
}

export interface DashboardData {
  stats: {
    activeClients: number;
    totalServices: number;
    totalWebsites: number;
    unpaidInvoices: number;
    outstandingAmount: number;
    monthlyHosting: number;
    maintenanceDue?: number;
  };
    charts: {
    clientsByStatus: { active: number; lead: number; inactive: number };
    invoicesByStatus: { draft: number; sent: number; paid: number; overdue: number; cancelled: number };
    renewalBuckets: { label: string; count: number }[];
    attention: { renewals: number; overdue: number; tasks: number };
  };
  expiringSoon: (Service & { client_name: string; client_id: number })[];
  overdueInvoices: {
    id: number;
    invoice_number: string;
    due_date: string;
    status: string;
    tax_rate: number;
    currency?: string;
    client_name: string;
    total?: number;
  }[];
  overdueTasks: {
    id: number;
    title: string;
    due_date: string;
    client_id: number | null;
    client_name: string | null;
  }[];
}
