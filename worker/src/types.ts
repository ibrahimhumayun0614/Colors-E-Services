import type { BankAccount } from './lib/bank-accounts';

export interface Env {
  DB: D1Database;
  API_SECRET: string;
  ALLOWED_ORIGINS?: string;
  /** Set to "true" in .dev.vars to skip login lockout (local dev only). */
  DISABLE_LOGIN_RATE_LIMIT?: string;
}

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
  /** Multiple bank accounts (preferred). Legacy bank_* fields mirror the first entry. */
  bank_accounts?: BankAccount[] | null;
}

export type ClientStatus = 'active' | 'inactive' | 'lead';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'open' | 'done';
export type ServiceType =
  | 'domain_hosting'
  | 'website_maintenance'
  | 'logo_design'
  | 'content_writing'
  | 'email_configuration';
export type ServiceStatus = 'lead' | 'active' | 'paused' | 'completed';
export type BillingCycle = 'one_time' | 'monthly' | 'quarterly' | 'annual' | 'none';

export interface Product {
  id: number;
  serial_number: string | null;
  name: string;
  description: string | null;
  sku: string | null;
  unit_price: number;
  currency: string;
  /** SQLite 0/1 in D1; may arrive as number from JSON. */
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

export interface Service {
  id: number;
  client_id: number;
  service_type: ServiceType;
  name: string;
  status: ServiceStatus;
  billing_cycle: BillingCycle;
  amount: number;
  currency: string;
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
  created_at: string;
  updated_at: string;
  client_name?: string;
}

/** @deprecated Use Service — kept for migration compatibility */
export type Website = Service & { monthly_cost?: number };

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
  currency: string;
  notes: string | null;
  bank_account_index?: number;
  payment_account?: string | null;
  created_at: string;
  updated_at: string;
  items?: InvoiceItem[];
  client_name?: string;
  subtotal?: number;
  total?: number;
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
