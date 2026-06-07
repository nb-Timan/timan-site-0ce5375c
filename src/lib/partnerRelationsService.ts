/**
 * Partner relations service.
 *
 * Reads/writes the two partner-hierarchy relationships used by Machine
 * Journal access control:
 *
 *  - Importer → child dealer
 *      Reuses public.dealer_accounts.parent_account_number. No new table.
 *
 *  - Service partner → dealer
 *      Backed by public.service_partner_dealer_links (additive table
 *      created in db/sql/20260608_partner_hierarchy.sql).
 *
 * Mutations are restricted server-side to Timan Backend / Service via RLS
 * (is_timan_staff() policies). The UI in BackendPartnerRelationsPage also
 * gates the page client-side, but RLS is the source of truth.
 */
import { supabase } from "@/lib/supabase";

export interface ServicePartnerLink {
  id: string;
  service_partner_account_id: string;
  dealer_account_id: string;
  active: boolean;
  created_at: string;
}

export async function listServicePartnerLinks(): Promise<ServicePartnerLink[]> {
  const { data, error } = await supabase
    .from("service_partner_dealer_links")
    .select("id, service_partner_account_id, dealer_account_id, active, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[partnerRelations] listServicePartnerLinks failed", error.message);
    return [];
  }
  return (data ?? []) as ServicePartnerLink[];
}

export async function upsertServicePartnerLink(
  servicePartnerAccountId: string,
  dealerAccountId: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!servicePartnerAccountId || !dealerAccountId) {
    return { ok: false, error: "Vælg både service partner og forhandler" };
  }
  if (servicePartnerAccountId === dealerAccountId) {
    return { ok: false, error: "Service partner og forhandler kan ikke være samme konto" };
  }
  const { error } = await supabase
    .from("service_partner_dealer_links")
    .upsert(
      {
        service_partner_account_id: servicePartnerAccountId,
        dealer_account_id: dealerAccountId,
        active,
      },
      { onConflict: "service_partner_account_id,dealer_account_id" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setServicePartnerLinkActive(
  id: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("service_partner_dealer_links")
    .update({ active })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteServicePartnerLink(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("service_partner_dealer_links")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------- Importer hierarchy (reuses parent_account_number) ----------

/**
 * Set / clear the importer parent of a dealer. Implemented via the
 * existing public.set_dealer_parent() RPC (phase 15), which is
 * timan_backend-only and handles the FK / cycle guard.
 */
export async function setImporterParent(
  childAccountNumber: string,
  importerAccountNumber: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("set_dealer_parent", {
    child_account_number: childAccountNumber,
    parent_account_number: importerAccountNumber ?? null,
    mark_parent_as_main: true,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
