// Phase 43 — Service registration and maintenance service layer.
// Reads/writes the public.service_machines, service_registrations and
// service_intervals tables. RLS enforces dealer scoping at DB level.

import { supabase } from '@/lib/supabase';

export interface ServiceMachine {
  id: string;
  serial_number: string;
  machine_type: string;
  dealer_account_id: string | null;
  dealer_number: string | null;
  dealer_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceRegistration {
  id: string;
  machine_id: string | null;
  serial_number: string;
  dealer_account_id: string | null;
  dealer_number: string | null;
  dealer_name: string | null;
  machine_type: string;
  customer_name: string | null;
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

export interface NewServiceRegistration {
  serial_number: string;
  machine_type: string;
  dealer_number: string | null;
  dealer_name: string | null;
  customer_name: string | null;
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

export async function listServiceIntervals(machineType?: string): Promise<ServiceInterval[]> {
  let q = supabase.from('service_intervals').select('*').eq('active', true).order('interval_hours');
  if (machineType) q = q.ilike('machine_type', machineType);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ServiceInterval[];
}

export async function listServiceMachines(opts?: {
  dealerNumber?: string | null;
  machineType?: string | null;
  search?: string | null;
}): Promise<ServiceMachine[]> {
  let q = supabase.from('service_machines').select('*').order('updated_at', { ascending: false });
  if (opts?.dealerNumber) q = q.eq('dealer_number', opts.dealerNumber);
  if (opts?.machineType) q = q.ilike('machine_type', `%${opts.machineType}%`);
  if (opts?.search) q = q.ilike('serial_number', `%${opts.search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ServiceMachine[];
}

export async function listServiceRegistrations(opts?: {
  serialNumber?: string;
  dealerNumber?: string | null;
}): Promise<ServiceRegistration[]> {
  let q = supabase.from('service_registrations').select('*').order('service_date', { ascending: false });
  if (opts?.serialNumber) q = q.ilike('serial_number', opts.serialNumber);
  if (opts?.dealerNumber) q = q.eq('dealer_number', opts.dealerNumber);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...(r as ServiceRegistration),
    attachment_urls: Array.isArray((r as { attachment_urls?: unknown }).attachment_urls)
      ? ((r as { attachment_urls: unknown[] }).attachment_urls as string[])
      : [],
  }));
}

/** Find-or-create the machine row keyed by serial_number (case-insensitive). */
async function ensureMachine(payload: NewServiceRegistration, createdByEmail: string | null): Promise<ServiceMachine> {
  const { data: existing, error: selErr } = await supabase
    .from('service_machines')
    .select('*')
    .ilike('serial_number', payload.serial_number)
    .maybeSingle();
  if (selErr && selErr.code !== 'PGRST116') throw selErr;
  if (existing) return existing as ServiceMachine;

  const { data: inserted, error: insErr } = await supabase
    .from('service_machines')
    .insert({
      serial_number: payload.serial_number,
      machine_type: payload.machine_type,
      dealer_number: payload.dealer_number,
      dealer_name: payload.dealer_name,
      customer_name: payload.customer_name,
      created_by_email: createdByEmail,
    })
    .select('*')
    .single();
  if (insErr) throw insErr;
  return inserted as ServiceMachine;
}

/** Coerce to a safe finite number for numeric columns. Never sends empty strings. */
function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function listServiceRegistrationParts(
  serviceRegistrationId: string,
): Promise<ServiceRegistrationPart[]> {
  const { data, error } = await supabase
    .from('service_registration_parts')
    .select('*')
    .eq('service_registration_id', serviceRegistrationId)
    .order('source_type')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as ServiceRegistrationPart[];
}

export async function createServiceRegistration(
  payload: NewServiceRegistration,
  createdByEmail: string | null,
): Promise<ServiceRegistration> {
  const machine = await ensureMachine(payload, createdByEmail);
  const { data, error } = await supabase
    .from('service_registrations')
    .insert({
      machine_id: machine.id,
      serial_number: payload.serial_number,
      dealer_number: payload.dealer_number,
      dealer_name: payload.dealer_name,
      machine_type: payload.machine_type,
      customer_name: payload.customer_name,
      service_date: payload.service_date,
      operating_hours: num(payload.operating_hours),
      service_interval_hours: num(payload.service_interval_hours),
      technician_name: payload.technician_name,
      service_plan_completed: payload.service_plan_completed,
      notes: payload.notes,
      faults_found: payload.faults_found,
      spare_parts_used: payload.spare_parts_used,
      attachment_urls: payload.attachment_urls,
      total_servicekit_price: num(payload.total_servicekit_price),
      total_extra_parts_price: num(payload.total_extra_parts_price),
      total_price: num(payload.total_price),
      created_by_email: createdByEmail,
    })
    .select('*')
    .single();
  if (error) throw error;
  const registration = data as ServiceRegistration;

  // Persist structured parts (servicekit + extra). Non-fatal if it fails so the
  // main registration is never lost; surfaced via console for ops.
  const partRows = (payload.parts ?? [])
    .filter((p) => (p.item_number?.trim() || p.description?.trim()))
    .map((p) => ({
      service_registration_id: registration.id,
      source_type: p.source_type,
      item_number: p.item_number?.trim() || null,
      description: p.description?.trim() || null,
      unit_price: num(p.unit_price),
      quantity: num(p.quantity),
      line_total: num(p.line_total),
    }));
  if (partRows.length) {
    const { error: partsErr } = await supabase
      .from('service_registration_parts')
      .insert(partRows);
    if (partsErr) {
      console.error('[service-maintenance] parts insert failed', partsErr);
    }
  }

  return registration;
}
