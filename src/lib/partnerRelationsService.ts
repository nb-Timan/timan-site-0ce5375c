/**
 * Partner relations service.
 *
 * Reads/writes partner relationships.
 *
 * The old Machine Journal scope relations are still kept:
 *
 *  - Importer → child dealer
 *      Reuses public.dealer_accounts.parent_account_number. No new table.
 *
 *  - Service partner → dealer
 *      Backed by public.service_partner_dealer_links (additive table
 *      created in db/sql/20260608_partner_hierarchy.sql).
 *
 * General mutations remain restricted server-side. The service-partner main
 * relation uses its scoped RPC, which validates the current internal user's
 * administrative scope for both accounts before writing.
 */
import { supabase } from "@/lib/supabase";

export type PartnerAccountRelationType =
  | "importer_has_dealer"
  | "importer_has_service_partner"
  | "importer_has_dealer_customer"
  | "dealer_has_service_partner"
  | "dealer_has_dealer_customer"
  | "service_partner_has_dealer_customer"
  | "service_partner_has_dealer";

export interface PartnerAccountRelation {
  id: string;
  source_account_id: string;
  target_account_id: string;
  relation_type: PartnerAccountRelationType;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServicePartnerMainRelationResult {
  child_account_id: string;
  parent_account_id: string | null;
  billing_account_id: string | null;
  relation_id: string | null;
}

export interface ServicePartnerLink {
  id: string;
  service_partner_account_id: string;
  dealer_account_id: string;
  active: boolean;
  created_at: string;
}

export async function listPartnerAccountRelations(): Promise<PartnerAccountRelation[]> {
  const { data, error } = await supabase
    .from("partner_account_relations")
    .select("id, source_account_id, target_account_id, relation_type, active, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[partnerRelations] listPartnerAccountRelations failed", error.message);
    return [];
  }
  return (data ?? []) as PartnerAccountRelation[];
}

export async function listPartnerAccountRelationsForAccount(accountId: string): Promise<PartnerAccountRelation[]> {
  if (!accountId) return [];
  const { data, error } = await supabase
    .from("partner_account_relations")
    .select("id, source_account_id, target_account_id, relation_type, active, created_at, updated_at")
    .or(`source_account_id.eq.${accountId},target_account_id.eq.${accountId}`)
    .eq("active", true)
    .order("updated_at", { ascending: false });
  if (error) {
    console.warn("[partnerRelations] account relation read failed", error.message);
    return [];
  }
  return (data ?? []) as PartnerAccountRelation[];
}

export async function setServicePartnerMainRelation(input: {
  childAccountId: string;
  parentAccountId: string | null;
  billViaParent: boolean;
}): Promise<{ ok: boolean; row?: ServicePartnerMainRelationResult; error?: string }> {
  const { data, error } = await supabase.rpc("set_service_partner_main_relation", {
    p_child_account_id: input.childAccountId,
    p_parent_account_id: input.parentAccountId,
    p_bill_via_parent: input.billViaParent,
  });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, row: row as ServicePartnerMainRelationResult | undefined };
}

export async function upsertPartnerAccountRelation(
  sourceAccountId: string,
  targetAccountId: string,
  relationType: PartnerAccountRelationType,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!sourceAccountId || !targetAccountId || !relationType) {
    return { ok: false, error: "Vælg fra, relation og til" };
  }
  if (sourceAccountId === targetAccountId) {
    return { ok: false, error: "En virksomhed kan ikke kobles til sig selv" };
  }
  const { error } = await supabase
    .from("partner_account_relations")
    .upsert(
      {
        source_account_id: sourceAccountId,
        target_account_id: targetAccountId,
        relation_type: relationType,
        active,
      },
      { onConflict: "source_account_id,target_account_id,relation_type" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setPartnerAccountRelationActive(
  id: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("partner_account_relations")
    .update({ active })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deletePartnerAccountRelation(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("partner_account_relations")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
