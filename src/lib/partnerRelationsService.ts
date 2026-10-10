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

type PartnerAccountReference = {
  id: string;
  account_number: string;
};

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
  ended_at?: string | null;
  ended_by?: string | null;
  end_reason?: string | null;
}

const MAIN_SERVICE_PARTNER_RELATION_TYPES = new Set<PartnerAccountRelationType>([
  "dealer_has_service_partner",
  "importer_has_service_partner",
]);

/**
 * Resolves the canonical main-partner relation to account numbers for list
 * rendering. This deliberately does not reuse billing_account_id: hierarchy
 * and billing are separate concepts.
 */
export function mainPartnerAccountNumbersByChild(
  accounts: PartnerAccountReference[],
  relations: PartnerAccountRelation[],
): Map<string, string> {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const parentByChild = new Map<string, string>();

  for (const relation of relations) {
    if (!relation.active || !MAIN_SERVICE_PARTNER_RELATION_TYPES.has(relation.relation_type)) continue;
    const parent = byId.get(relation.source_account_id);
    const child = byId.get(relation.target_account_id);
    if (!parent || !child || parent.account_number === child.account_number) continue;
    parentByChild.set(child.account_number, parent.account_number);
  }

  return parentByChild;
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
    .select("id, source_account_id, target_account_id, relation_type, active, created_at, updated_at, ended_at, ended_by, end_reason")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[partnerRelations] listPartnerAccountRelations failed", error.message);
    return [];
  }
  return (data ?? []) as PartnerAccountRelation[];
}

export async function listPartnerAccountRelationsForAccounts(
  accountIds: string[],
): Promise<PartnerAccountRelation[]> {
  const ids = Array.from(new Set(accountIds.map((value) => value.trim()).filter(Boolean)));
  if (ids.length === 0) return [];

  const columns = "id, source_account_id, target_account_id, relation_type, active, created_at, updated_at";
  const [sources, targets] = await Promise.all([
    supabase.from("partner_account_relations").select(columns).in("source_account_id", ids).eq("active", true),
    supabase.from("partner_account_relations").select(columns).in("target_account_id", ids).eq("active", true),
  ]);
  if (sources.error || targets.error) {
    console.warn(
      "[partnerRelations] scoped relation read failed",
      sources.error?.message ?? targets.error?.message,
    );
    return [];
  }

  const byId = new Map<string, PartnerAccountRelation>();
  for (const row of [...(sources.data ?? []), ...(targets.data ?? [])] as PartnerAccountRelation[]) {
    byId.set(row.id, row);
  }
  return Array.from(byId.values()).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
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

export type PartnerCooperationAction = 'ACTIVATE' | 'END' | 'SWITCH';
export interface PartnerCooperationEvent {
  id: string;
  version: number;
  action: PartnerCooperationAction;
  previous_dealer_id: string | null;
  new_dealer_id: string | null;
  reviewed_by: string;
  reviewer_name: string | null;
  created_at: string;
  reason: string;
  relation_type?: PartnerAccountRelationType;
  previous_relation_type?: PartnerAccountRelationType | null;
}
export interface PartnerCooperationHistory {
  version: number;
  events: PartnerCooperationEvent[];
  billing?: { source_count: number; invoice_account: string | null };
}
export async function loadPartnerCooperationHistory(customerId: string): Promise<PartnerCooperationHistory> {
  const { data, error } = await supabase.rpc('partner_cooperation_history', { p_customer_id: customerId });
  if (error) throw error;
  return data as unknown as PartnerCooperationHistory;
}
export async function changePartnerCooperation(input: {
  customerId: string; expectedVersion: number; action: PartnerCooperationAction;
  newDealerId: string | null; confirmed: boolean; reason: string; requestId: string;
  relationType?: PartnerAccountRelationType; previousRelationId?: string;
}) {
  const args = {
    p_customer_id: input.customerId, p_expected_version: input.expectedVersion, p_action: input.action,
    p_new_dealer_id: input.newDealerId, p_confirm_new_relation: input.confirmed, p_reason: input.reason,
    p_request_id: input.requestId,
    ...(input.relationType ? { p_relation_type: input.relationType, p_previous_relation_id: input.previousRelationId ?? null } : {}),
  };
  const { data, error } = await supabase.rpc(input.relationType ? 'partner_cooperation_change_typed' : 'partner_cooperation_change', args);
  // The schema release is separately approved. Preserve the established customer
  // lifecycle until then; never substitute this endpoint for another relation type.
  if (error && input.relationType === 'dealer_has_dealer_customer' && ['PGRST202','42883'].includes(error.code)) {
    const { p_relation_type: _type, p_previous_relation_id: _previous, ...legacyArgs } = args;
    const legacy = await supabase.rpc('partner_cooperation_change', legacyArgs);
    if (legacy.error) throw legacy.error;
    return legacy.data as string;
  }
  if (error) throw error;
  return data as string;
}
export function partnerCooperationError(error: unknown): string {
  const message = error && typeof error === 'object' ? `${'code' in error ? error.code : ''} ${'message' in error ? error.message : ''}` : '';
  if (/VERSION_CONFLICT|STATE_CONFLICT/.test(message)) return 'Samarbejdet er ændret. Genindlæs før du fortsætter.';
  if (/BACKEND_ONLY/.test(message)) return 'Kun Timan Backend kan ændre samarbejdet.';
  if (/PARENT_CONFLICT|REVIEW_REQUIRED/.test(message)) return 'Eksisterende relationer kræver afklaring. Ingen ændring er gemt.';
  if (/APPROVAL_REQUIRED/.test(message)) return 'Den nye relation skal godkendes eksplicit.';
  if (/CYCLE|INVALID_RELATION_TYPE|VALID_PARTNERS_REQUIRED/.test(message)) return 'Relationen er ikke gyldig for disse partnere, eller den skaber en cirkel.';
  if (/PGRST202|42883/.test(message)) return 'Relationsopdateringen skal først frigives i databasen. Ingen ændring er gemt.';
  return 'Samarbejdet kunne ikke gemmes. Genindlæs og prøv igen.';
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
