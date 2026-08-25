import { supabase } from "@/lib/supabase";

const LS_SHARES = "timan.crm.leadShares.v1";

export interface CrmLeadShare {
  id: string;
  lead_id: string;
  shared_by_user_id: string | null;
  shared_by_name: string | null;
  shared_by_email: string | null;
  shared_with_user_id: string;
  shared_with_name: string | null;
  shared_with_email: string | null;
  shared_with_dealer_account_id: string | null;
  direction: "timan_to_dealer" | "dealer_to_timan";
  channel: "portal" | "portal_email";
  note: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface LeadShareTarget {
  id: string;
  name: string;
  email: string;
  dealer_number: string | null;
  role: string | null;
}

function readLocalShares(): CrmLeadShare[] {
  try { return JSON.parse(localStorage.getItem(LS_SHARES) || "[]") as CrmLeadShare[]; }
  catch { return []; }
}

function mapTarget(row: Record<string, unknown>): LeadShareTarget {
  const fullName = String(row.full_name || row.display_name || row.email || "");
  return {
    id: String(row.id),
    name: fullName,
    email: String(row.email || ""),
    dealer_number: (row.dealer_number as string | null) ?? null,
    role: (row.portal_role as string | null) ?? (row.role as string | null) ?? null,
  };
}

export async function resolveAppUserByEmail(email: string | null | undefined): Promise<LeadShareTarget | null> {
  const e = (email || "").trim().toLowerCase();
  if (!e) return null;
  const { data, error } = await supabase
    .from("app_users")
    .select("id,email,full_name,display_name,dealer_number,portal_role,role")
    .eq("email", e)
    .maybeSingle();
  if (error || !data) return null;
  return mapTarget(data as Record<string, unknown>);
}

export async function listLeadShares(leadId: string): Promise<CrmLeadShare[]> {
  try {
    const { data, error } = await supabase
      .from("crm_lead_shares")
      .select("*")
      .eq("lead_id", leadId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []) as CrmLeadShare[];
  } catch {
    return readLocalShares().filter((r) => r.lead_id === leadId && !r.revoked_at);
  }
}

export async function listSharedLeadIdsForUser(userId: string | null | undefined): Promise<Set<string>> {
  if (!userId) return new Set();
  try {
    const { data, error } = await supabase
      .from("crm_lead_shares")
      .select("lead_id")
      .eq("shared_with_user_id", userId)
      .is("revoked_at", null);
    if (error) throw error;
    return new Set((data || []).map((r) => String(r.lead_id)));
  } catch {
    return new Set(readLocalShares().filter((r) => r.shared_with_user_id === userId && !r.revoked_at).map((r) => r.lead_id));
  }
}

export async function listActiveDealerLeadShareTargets(dealerAccountId: string): Promise<LeadShareTarget[]> {
  const { data: dealer, error: dealerError } = await supabase
    .from("dealer_accounts")
    .select("account_number")
    .eq("id", dealerAccountId)
    .maybeSingle();
  if (dealerError || !dealer?.account_number) return [];

  const { data, error } = await supabase
    .from("app_users")
    .select("id,email,full_name,display_name,dealer_number,portal_role,role,status,approved,is_active")
    .eq("dealer_number", dealer.account_number)
    .eq("approved", true)
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (error) return [];
  return (data || [])
    .map((row) => mapTarget(row as Record<string, unknown>))
    .filter((u) => u.email);
}

export async function getResponsibleTimanSellerTarget(dealerAccountId: string): Promise<LeadShareTarget | null> {
  const { data: dealer, error } = await supabase
    .from("dealer_accounts")
    .select("assigned_seller_id,assigned_seller_email,assigned_seller_name")
    .eq("id", dealerAccountId)
    .maybeSingle();
  if (error || !dealer) return null;

  if (dealer.assigned_seller_id) {
    const { data } = await supabase
      .from("app_users")
      .select("id,email,full_name,display_name,dealer_number,portal_role,role")
      .eq("id", dealer.assigned_seller_id)
      .maybeSingle();
    if (data) return mapTarget(data as Record<string, unknown>);
  }
  const byEmail = await resolveAppUserByEmail(dealer.assigned_seller_email as string | null);
  if (byEmail) return byEmail;
  return null;
}

export async function shareLead(input: {
  leadId: string;
  sharedBy: LeadShareTarget | null;
  target: LeadShareTarget;
  dealerAccountId: string | null;
  direction: CrmLeadShare["direction"];
  includeEmail: boolean;
  note?: string | null;
}): Promise<CrmLeadShare> {
  const channel: CrmLeadShare["channel"] = input.includeEmail ? "portal_email" : "portal";

  try {
    const { data: existing } = await supabase
      .from("crm_lead_shares")
      .select("*")
      .eq("lead_id", input.leadId)
      .eq("shared_with_user_id", input.target.id)
      .is("revoked_at", null)
      .maybeSingle();
    if (existing) return existing as CrmLeadShare;
  } catch { /* insert attempt will surface real errors */ }

  const row = {
    lead_id: input.leadId,
    shared_by_user_id: input.sharedBy?.id ?? null,
    shared_by_name: input.sharedBy?.name ?? null,
    shared_by_email: input.sharedBy?.email ?? null,
    shared_with_user_id: input.target.id,
    shared_with_name: input.target.name,
    shared_with_email: input.target.email,
    shared_with_dealer_account_id: input.dealerAccountId,
    direction: input.direction,
    channel,
    note: input.note || null,
  };

  try {
    const { data, error } = await supabase
      .from("crm_lead_shares")
      .insert(row)
      .select("*")
      .single();
    if (error) throw error;
    const saved = data as CrmLeadShare;
    await supabase.from("crm_lead_share_audit_log").insert({
      lead_share_id: saved.id,
      lead_id: saved.lead_id,
      action: "shared",
      actor_user_id: saved.shared_by_user_id,
      actor_name: saved.shared_by_name,
      actor_email: saved.shared_by_email,
      target_user_id: saved.shared_with_user_id,
      target_name: saved.shared_with_name,
      target_email: saved.shared_with_email,
      channel: saved.channel,
      direction: saved.direction,
      note: saved.note,
    });
    return saved;
  } catch (error) {
    console.error("[CRM lead sharing] Could not persist lead share", error);
    throw error;
  }
}

export function leadShareMailto(input: {
  targetEmail: string;
  leadTitle: string;
  leadUrl: string;
  senderName?: string | null;
}): string {
  const subject = `Delt lead: ${input.leadTitle}`;
  const body = [
    `Hej`,
    ``,
    `${input.senderName || "Timan"} har delt et lead med dig i Timan-portalen:`,
    input.leadTitle,
    input.leadUrl,
  ].join("\n");
  return `mailto:${encodeURIComponent(input.targetEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
