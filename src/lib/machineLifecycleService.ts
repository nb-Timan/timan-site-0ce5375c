/**
 * Phase 3+4a — read-only access to public.machines and public.service_tickets
 * via supabase-js. Relies on existing RLS policies; never uses service_role.
 */
import { supabase } from "@/lib/supabase";

export interface MachineRecord {
  id: string;
  serial_number: string | null;
  machine_number: string | null;
  machine_type: string | null;
  model: string | null;
  production_year: number | null;
  dealer_account_id: string | null;
  dealer_number: string | null;
  dealer_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  seller_user_id: string | null;
  seller_email: string | null;
  seller_initials: string | null;
  warranty_start_date: string | null;
  warranty_end_date: string | null;
  current_hours: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ServiceTicket {
  id: string;
  ticket_number: string | null;
  title: string;
  status: string;
  priority: string;
  category: string | null;
  dealer_name: string | null;
  created_at: string | null;
  assigned_name: string | null;
}

const SELECT_COLS =
  "id, serial_number, machine_number, machine_type, model, production_year, " +
  "dealer_account_id, dealer_number, dealer_name, customer_name, customer_email, customer_phone, " +
  "seller_user_id, seller_email, seller_initials, " +
  "warranty_start_date, warranty_end_date, current_hours, created_at, updated_at";

/**
 * Find one machine by serial_number OR machine_number, case-insensitive.
 * Returns null when nothing matches. Throws on Supabase errors.
 */
export async function findMachineByIdentifier(rawQuery: string): Promise<MachineRecord | null> {
  const q = rawQuery.trim();
  if (!q) return null;

  // PostgREST .or() requires escaping commas/parentheses. Identifiers won't usually
  // contain those, but we sanitize defensively.
  const safe = q.replace(/[(),]/g, "");

  const { data, error } = await supabase
    .from("machines")
    .select(SELECT_COLS)
    .or(`serial_number.ilike.${safe},machine_number.ilike.${safe}`)
    .limit(1);

  if (error) throw error;
  return (data && data[0] ? (data[0] as unknown as MachineRecord) : null);
}

const TICKET_COLS =
  "id, ticket_number, title, status, priority, category, dealer_name, created_at, assigned_name";

/**
 * Fetch service tickets linked to a machine by machine_id OR serial_number.
 * Returns empty array when none match. Throws on Supabase errors.
 */
export async function fetchServiceTicketsForMachine(
  machineId: string,
  serialNumber: string | null
): Promise<ServiceTicket[]> {
  const safeSerial = (serialNumber || "").replace(/[(),]/g, "");

  const { data, error } = await supabase
    .from("service_tickets")
    .select(TICKET_COLS)
    .or(`machine_id.eq.${machineId},serial_number.ilike.${safeSerial}`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as unknown as ServiceTicket[]) || [];
}

/**
 * Fetch all service tickets visible to the current user (scoped by RLS).
 * Dealers see only their own tickets; internal users see everything.
 */
export async function fetchVisibleServiceTickets(limit = 200): Promise<ServiceTicket[]> {
  const { data, error } = await supabase
    .from("service_tickets")
    .select(TICKET_COLS + ", serial_number")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as ServiceTicket[]) || [];
}

export interface NewServiceTicketInput {
  title: string;
  description: string;
  serial_number: string;
  machine_type?: string | null;
  dealer_account_id?: string | null;
  dealer_number?: string | null;
  dealer_name?: string | null;
  customer_name?: string | null;
  contact_person?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  operating_hours?: number | null;
  priority: string;
  status: string;
  category?: string | null;
  assigned_email?: string | null;
  assigned_name?: string | null;
}

/**
 * Insert a new service ticket. If a machine row exists for the given
 * serial_number it is linked via machine_id. Otherwise the ticket is
 * still created and only serial_number is stored.
 *
 * Uses the standard supabase-js client — RLS decides whether the insert
 * is allowed (dealer scope vs. internal).
 */
export async function createServiceTicket(input: NewServiceTicketInput): Promise<{ id: string }> {
  const serial = input.serial_number.trim();
  if (!serial) throw new Error("serial_number required");

  // Best-effort machine lookup. RLS may hide it — that's OK, then machine_id stays null.
  let machineId: string | null = null;
  try {
    const { data: m } = await supabase
      .from("machines")
      .select("id")
      .ilike("serial_number", serial)
      .limit(1);
    if (m && m[0]) machineId = (m[0] as { id: string }).id;
  } catch {
    machineId = null;
  }

  const { data: sess } = await supabase.auth.getSession();
  const createdByEmail = sess.session?.user?.email ?? null;
  const createdByUserId = sess.session?.user?.id ?? null;

  const payload = {
    machine_id: machineId,
    serial_number: serial,
    machine_type: input.machine_type || null,
    dealer_account_id: input.dealer_account_id || null,
    dealer_number: input.dealer_number || null,
    dealer_name: input.dealer_name || null,
    customer_name: input.customer_name || null,
    contact_person: input.contact_person || null,
    contact_email: input.contact_email || null,
    contact_phone: input.contact_phone || null,
    operating_hours: input.operating_hours ?? null,
    title: input.title.trim(),
    description: input.description.trim(),
    priority: input.priority,
    status: input.status,
    category: input.category || null,
    assigned_email: input.assigned_email || null,
    assigned_name: input.assigned_name || null,
    created_by_user_id: createdByUserId,
    created_by_email: createdByEmail,
  };

  const { data, error } = await supabase
    .from("service_tickets")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}


