/**
 * Dealer accounts service — public.dealer_accounts.
 *
 * Used by:
 *   • Backend → Forhandlere (admin page)
 *   • Backend → Brugere (dealer picker when approving users)
 *
 * Does NOT touch configurator pricing, product data or quote/order logic.
 */

import { supabase } from "@/lib/supabase";

export interface DealerAccount {
  id: string;
  account_number: string;
  company_name: string;
  customer_type: string | null;
  customer_type_label: string | null;
  country: string | null;
  postal_code: string | null;
  city: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  assigned_seller_initials: string | null;
  assigned_seller_name: string | null;
  assigned_seller_email: string | null;
  source_created_at: string | null;
  source_changed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DealerAccountsSource = "supabase" | "fallback";

export interface DealerAccountsResult {
  source: DealerAccountsSource;
  rows: DealerAccount[];
  error?: string;
}

function rowToDealer(row: Record<string, unknown>): DealerAccount {
  return {
    id: String(row.id),
    account_number: (row.account_number as string) || "",
    company_name: (row.company_name as string) || "",
    customer_type: (row.customer_type as string | null) ?? null,
    customer_type_label: (row.customer_type_label as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    postal_code: (row.postal_code as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    assigned_seller_initials: (row.assigned_seller_initials as string | null) ?? null,
    assigned_seller_name: (row.assigned_seller_name as string | null) ?? null,
    assigned_seller_email: (row.assigned_seller_email as string | null) ?? null,
    source_created_at: (row.source_created_at as string | null) ?? null,
    source_changed_at: (row.source_changed_at as string | null) ?? null,
    created_at: (row.created_at as string) || new Date().toISOString(),
    updated_at: (row.updated_at as string) || new Date().toISOString(),
  };
}

export async function fetchDealerAccounts(): Promise<DealerAccountsResult> {
  try {
    const { data, error, status } = await supabase
      .from("dealer_accounts")
      .select("*")
      .order("company_name", { ascending: true });
    if (error) throw error;
    const rows = (data ?? []).map(rowToDealer);
    if (rows.length === 0) {
      return {
        source: "supabase",
        rows,
        error:
          `Supabase returnerede 0 rækker fra public.dealer_accounts (HTTP ${status}). ` +
          `Hvis tabellen indeholder data, skyldes det sandsynligvis Row Level Security — ` +
          `tilføj en SELECT-policy der tillader 'anon' og 'authenticated' (se docs/sql/phase9b_dealer_accounts_rls_anon.sql).`,
      };
    }
    return { source: "supabase", rows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { source: "fallback", rows: [], error: `Supabase fejl ved hentning af dealer_accounts: ${msg}` };
  }
}

export interface UpdateSellerPatch {
  assigned_seller_initials: string | null;
  assigned_seller_name: string | null;
  assigned_seller_email: string | null;
}

export async function updateDealerSeller(
  id: string,
  patch: UpdateSellerPatch,
): Promise<{ ok: boolean; error?: string; row?: DealerAccount }> {
  try {
    const { data, error } = await supabase
      .from("dealer_accounts")
      .update({
        assigned_seller_initials: patch.assigned_seller_initials,
        assigned_seller_name: patch.assigned_seller_name,
        assigned_seller_email: patch.assigned_seller_email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return { ok: true, row: data ? rowToDealer(data) : undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
