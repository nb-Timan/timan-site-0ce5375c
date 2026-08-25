/**
 * dealer_contacts CRUD — extra people for director/sales/workshop/parts/marketing/finance.
 * RLS in phase52 allows: backend full access; dealer-side user limited to own
 * dealer_accounts row via current_user_dealer_number().
 */
import { supabase } from "@/lib/supabase";

export type DealerContactArea = "director" | "sales" | "workshop" | "parts" | "marketing" | "finance";

export interface DealerContact {
  id: string;
  dealer_account_id: string;
  contact_area: DealerContactArea;
  role_title: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

function rowToContact(r: Record<string, unknown>): DealerContact {
  return {
    id: String(r.id),
    dealer_account_id: String(r.dealer_account_id),
    contact_area: (r.contact_area as DealerContactArea) ?? "sales",
    role_title: (r.role_title as string | null) ?? null,
    name: (r.name as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    is_primary: Boolean(r.is_primary ?? false),
    created_at: (r.created_at as string) ?? new Date().toISOString(),
    updated_at: (r.updated_at as string) ?? new Date().toISOString(),
  };
}

export async function listDealerContacts(dealerAccountId: string): Promise<DealerContact[]> {
  const { data, error } = await supabase
    .from("dealer_contacts")
    .select("*")
    .eq("dealer_account_id", dealerAccountId)
    .order("created_at", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[dealerContactsService] list error", error);
    return [];
  }
  return (data ?? []).map(rowToContact);
}

export interface UpsertDealerContactInput {
  id?: string;
  dealer_account_id: string;
  contact_area: DealerContactArea;
  role_title?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
}

export async function upsertDealerContact(
  input: UpsertDealerContactInput,
): Promise<{ ok: boolean; row?: DealerContact; error?: string }> {
  try {
    if (input.id) {
      const { data, error } = await supabase
        .from("dealer_contacts")
        .update({
          contact_area: input.contact_area,
          role_title: input.role_title ?? null,
          name: input.name ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          is_primary: input.is_primary ?? false,
        })
        .eq("id", input.id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return { ok: true, row: data ? rowToContact(data) : undefined };
    }
    const { data, error } = await supabase
      .from("dealer_contacts")
      .insert({
        dealer_account_id: input.dealer_account_id,
        contact_area: input.contact_area,
        role_title: input.role_title ?? null,
        name: input.name ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        is_primary: input.is_primary ?? false,
      })
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return { ok: true, row: data ? rowToContact(data) : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteDealerContact(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("dealer_contacts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
