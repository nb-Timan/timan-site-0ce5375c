// Canonical Service Model C client.
// Warranty registrations remain the machine registry. Service is an immutable
// performed-service event created through one scoped, transactional RPC.

import { supabase } from '@/lib/supabase';

export interface ServiceMachine {
  id: string;
  machine_registration_id: string | null;
  serial_number: string;
  normalized_serial: string;
  machine_type: string;
  dealer_account_id: string | null;
  dealer_number: string | null;
  dealer_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  latest_service_date: string | null;
  current_hours: number | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceRegistration {
  id: string;
  machine_id: string | null;
  machine_registration_id: string | null;
  normalized_serial: string;
  serial_number: string;
  dealer_account_id: string | null;
  dealer_number: string | null;
  dealer_name: string | null;
  machine_type: string;
  customer_name: string | null;
  customer_email: string | null;
  service_date: string;
  operating_hours: number | null;
  service_interval_hours: number;
  technician_name: string | null;
  service_plan_completed: boolean;
  notes: string | null;
  faults_found: string | null;
  spare_parts_used: string | null;
  attachment_urls: string[];
  total_servicekit_price: number | null;
  total_extra_parts_price: number | null;
  total_price: number | null;
  created_by_email: string | null;
  created_at: string;
}

export interface ServiceInterval {
  id: string;
  machine_type: string;
  interval_hours: number;
  label: string | null;
  active: boolean;
}

export interface ServiceRegistrationPartInput {
  source_type: 'servicekit' | 'extra';
  item_number: string | null;
  description: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface ServiceRegistrationPart extends ServiceRegistrationPartInput {
  id: string;
  service_registration_id: string;
  created_at: string;
}

export interface ScopedServiceDealer {
  id: string;
  account_number: string;
  company_name: string;
}

export interface NewServiceRegistration {
  serial_number: string;
  machine_type: string;
  dealer_number: string | null;
  dealer_name: string | null;
  customer_name: string | null;
  customer_email?: string | null;
  register_user_change?: boolean;
  new_user_name?: string | null;
  new_user_email?: string | null;
  service_date: string;
  operating_hours: number | null;
  service_interval_hours: number;
  technician_name: string | null;
  service_plan_completed: boolean;
  notes: string | null;
  faults_found: string | null;
  spare_parts_used: string | null;
  attachment_urls: string[];
  total_servicekit_price: number;
  total_extra_parts_price: number;
  total_price: number;
  parts: ServiceRegistrationPartInput[];
}

type RawRegistration = Omit<ServiceRegistration, 'machine_id' | 'dealer_number' | 'dealer_name' | 'attachment_urls'> & {
  machine_registration_id?: string | null;
  dealer_account_number?: string | null;
  dealer_name_snapshot?: string | null;
  attachment_urls?: unknown;
  created_by_email?: string | null;
};

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function mapRegistration(row: RawRegistration): ServiceRegistration {
  return {
    ...row,
    machine_id: row.machine_registration_id ?? null,
    machine_registration_id: row.machine_registration_id ?? null,
    dealer_number: row.dealer_account_number ?? null,
    dealer_name: row.dealer_name_snapshot ?? null,
    attachment_urls: arrayOfStrings(row.attachment_urls),
    created_by_email: row.created_by_email ?? null,
  };
}

function mapMachine(row: Record<string, unknown>): ServiceMachine {
  return {
    id: String(row.machine_registration_id ?? row.normalized_serial ?? row.serial_number),
    machine_registration_id: typeof row.machine_registration_id === 'string' ? row.machine_registration_id : null,
    serial_number: String(row.serial_number ?? ''),
    normalized_serial: String(row.normalized_serial ?? ''),
    machine_type: String(row.machine_model ?? ''),
    dealer_account_id: typeof row.dealer_account_id === 'string' ? row.dealer_account_id : null,
    dealer_number: typeof row.dealer_account_number === 'string' ? row.dealer_account_number : null,
    dealer_name: typeof row.dealer_name === 'string' ? row.dealer_name : null,
    customer_name: typeof row.customer_name === 'string' ? row.customer_name : null,
    customer_email: typeof row.customer_email === 'string' ? row.customer_email : null,
    customer_phone: null,
    latest_service_date: typeof row.latest_service_date === 'string' ? row.latest_service_date : null,
    current_hours: typeof row.current_hours === 'number' ? row.current_hours : null,
    created_at: '',
    updated_at: '',
  };
}

// Intervals remain the existing local service-basis data. This retained export
// prevents callers from probing the never-released legacy interval table.
export async function listServiceIntervals(): Promise<ServiceInterval[]> {
  return [];
}

export async function listScopedServiceDealers(): Promise<ScopedServiceDealer[]> {
  const { data, error } = await supabase.rpc('list_scoped_service_dealers');
  if (error) throw error;
  return (data ?? []) as ScopedServiceDealer[];
}

export async function listServiceMachines(opts?: {
  dealerNumber?: string | null;
  machineType?: string | null;
  search?: string | null;
}): Promise<ServiceMachine[]> {
  const { data, error } = await supabase.rpc('list_scoped_service_machines', {
    p_dealer_account_number: opts?.dealerNumber || null,
    p_machine_type: opts?.machineType || null,
    p_query: opts?.search || null,
  });
  if (error) throw error;
  return (data ?? []).map((row) => mapMachine(row as Record<string, unknown>));
}

export async function searchServiceMachines(query: string, dealerNumber?: string | null): Promise<ServiceMachine[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  const { data, error } = await supabase.rpc('search_scoped_service_machines', {
    p_query: normalized,
    p_dealer_account_number: dealerNumber || null,
  });
  if (error) throw error;
  return (data ?? []).map((row) => mapMachine(row as Record<string, unknown>));
}

export async function listServiceRegistrations(opts?: {
  serialNumber?: string;
  dealerNumber?: string | null;
}): Promise<ServiceRegistration[]> {
  let query = supabase.from('service_registrations').select('*').order('service_date', { ascending: false });
  if (opts?.serialNumber) query = query.eq('normalized_serial', opts.serialNumber.toUpperCase().replace(/[^A-Z0-9]+/g, ''));
  if (opts?.dealerNumber) query = query.eq('dealer_account_number', opts.dealerNumber);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapRegistration(row as RawRegistration));
}

export async function getServiceRegistration(id: string): Promise<ServiceRegistration | null> {
  const { data, error } = await supabase.from('service_registrations').select('*').eq('id', id).maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data ? mapRegistration(data as RawRegistration) : null;
}

export async function listServiceRegistrationParts(serviceRegistrationId: string): Promise<ServiceRegistrationPart[]> {
  const { data, error } = await supabase
    .from('service_registration_parts')
    .select('*')
    .eq('service_registration_id', serviceRegistrationId)
    .order('source_type')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as ServiceRegistrationPart[];
}

export async function createServiceRegistration(payload: NewServiceRegistration): Promise<ServiceRegistration> {
  const { data, error } = await supabase.rpc('create_scoped_service_registration', {
    p_registration: { ...payload, dealer_account_number: payload.dealer_number },
  });
  if (error) throw error;
  return mapRegistration(data as RawRegistration);
}
