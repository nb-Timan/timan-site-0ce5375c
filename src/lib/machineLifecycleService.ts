/**
 * Phase 3 — read-only access to public.machines via supabase-js.
 * Relies on existing RLS policies; never uses service_role.
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
