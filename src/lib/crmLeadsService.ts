/**
 * CRM Leads & Demo Leads service.
 *
 * Source of truth: public.crm_leads / public.crm_demo_leads (Supabase).
 * Fallback: localStorage so the UI keeps working during preview / when the
 * tables haven't been provisioned yet — mirrors the pattern in
 * crmActivitiesService.ts.
 */
import { supabase } from "@/lib/supabase";
import { notifyLocalFallback } from "@/lib/persistenceWarning";
import { logActivity, type CrmActivity } from "@/lib/crmActivitiesService";
import { BUDGET_PRODUCTS, EQUIPMENT_BY_MACHINE, localizedName } from "@/lib/crmBudgetService";
import machineDemoSeed from "@/data/machineDemoSeed.json";
import openLeadsSeed from "@/data/openLeadsSeed.json";

// ---------- Shared option lists (Danish UI) ----------

export const MACHINE_TYPE_OPTIONS = [
  "RC-751", "RC-1000s", "Timan 3330", "CS-200 Combi", "CS-200 Tractor",
  "New 2620", "Full Line", "Tool-Trac 5740", "T2", "T3",
  "V-Plow", "Center-driven sweeper", "Rotary mower", "Hedgetrimmer",
  "Weed brush", "Stump grinder", "Cutter bar - RC-1000s", "Tornado 400",
  "RC-1000", "Third-Party Equipment",
] as const;

export const NEXT_ACTIVITY_OPTIONS = [
  "Follow-up on leads",
  "Sales material sent to the customer",
  "Offer sent to the customer",
  "Customer requests a demonstration",
  "Lead sent to the dealer",
  "Closed without order",
  "Closed with order",
  "Not relevant",
  "New lead",
  "Wants to be contacted",
  "Timan",
] as const;

export const CONTACT_TYPE_OPTIONS = [
  "Phone", "Email", "Trade fair", "Dealer", "SoMe",
  "Contact from Timan mails", "Timan Project Direct sales",
] as const;

export const CUSTOMER_TYPE_OPTIONS = [
  "Contractor Landscape gardener",
  "Housing association",
  "Municipality",
  "Institution (School, Hospital, etc.)",
  "Churches",
  "Company",
  "Private / End customer",
  "Rental company",
  "Dealer/Demo machine",
  "Direct sale",
  "Needs to be filled in",
  "Unknown",
] as const;

export const PIPELINE_STAGES = [
  "Lead", "Qualified", "Offer sent", "Negotiation", "Won", "Lost",
] as const;
export type PipelineStage = typeof PIPELINE_STAGES[number];

export const LOST_COMPETITOR_OPTIONS = [
  "Egholm", "Hako", "Kärcher", "Vitra", "Fort", "AS Motor",
  "Energreen", "X-Rot", "Husqvarna", "Andre",
] as const;

export const LOST_REASON_OPTIONS = [
  "Price",
  "Delivery time",
  "Machine too small",
  "Machine too large",
  "Customer found a used machine instead",
  "Budget changed or project was cancelled",
] as const;

// Demo lead specific
export const DEMO_MACHINE_CATEGORY = [
  "Timan machine", "Timan equipment", "Dealer's machine", "Dealer's equipment",
] as const;

export const DEMO_MACHINE_OPTIONS = [
  "RC-751", "RC-1000s", "Timan 3330", "Tool-Trac",
] as const;

export const DEMO_EQUIPMENT_OPTIONS = [
  "CS200 Combi", "CS200 for Tractor", "T2", "T3", "Tornado 400",
  "V-plow", "Center-driven Sweeper", "Weed Brush", "Rotary Mower",
  "Hedge Trimmer", "Stump grinder",
] as const;

export const DEMO_RESULT_STATUS = [
  "Hot lead", "Warm lead", "Cold lead", "Offer requested", "Won", "Lost", "No fit",
] as const;

// ---------- Types ----------

export type CrmLeadAttachment = {
  name: string;
  size: number;
  type?: string | null;
  storage_bucket: string;
  storage_path: string;
  uploaded_at?: string | null;
};

export type CrmLeadAttachmentPreview = CrmLeadAttachment & {
  signed_url: string;
};

export const CRM_LEAD_ATTACHMENTS_BUCKET = "crm-lead-attachments";

function sanitizeAttachmentFilename(name: string): string {
  const fallback = "attachment";
  const safe = (name || fallback)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return safe || fallback;
}

function storageFileId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch { /* */ }
  return uuid();
}

export function isLeadImageAttachment(attachment: CrmLeadAttachment): boolean {
  return !!attachment.storage_path && (
    !!attachment.type?.startsWith("image/")
    || /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i.test(attachment.name)
  );
}

export async function uploadLeadAttachments(leadId: string, files: File[]): Promise<CrmLeadAttachment[]> {
  if (!leadId || files.length === 0) return [];
  const uploaded: CrmLeadAttachment[] = [];

  for (const file of files) {
    const path = `${leadId}/${storageFileId()}-${sanitizeAttachmentFilename(file.name)}`;
    const { error } = await supabase.storage
      .from(CRM_LEAD_ATTACHMENTS_BUCKET)
      .upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (error) throw error;
    uploaded.push({
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      storage_bucket: CRM_LEAD_ATTACHMENTS_BUCKET,
      storage_path: path,
      uploaded_at: new Date().toISOString(),
    });
  }

  return uploaded;
}

export async function getLeadAttachmentSignedUrl(
  attachment: CrmLeadAttachment,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  if (!attachment.storage_path) return null;
  const bucket = attachment.storage_bucket || CRM_LEAD_ATTACHMENTS_BUCKET;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(attachment.storage_path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl || null;
}

export async function getLeadAttachmentSignedUrls(
  attachments: CrmLeadAttachment[] | null | undefined,
  expiresInSeconds = 60 * 60,
): Promise<CrmLeadAttachmentPreview[]> {
  const results = await Promise.all((attachments || []).map(async (attachment) => {
    const signedUrl = await getLeadAttachmentSignedUrl(attachment, expiresInSeconds);
    return signedUrl ? { ...attachment, signed_url: signedUrl } : null;
  }));
  return results.filter(Boolean) as CrmLeadAttachmentPreview[];
}

export function getLeadImageAttachments(attachments: CrmLeadAttachment[] | null | undefined): CrmLeadAttachment[] {
  return (attachments || []).filter(isLeadImageAttachment);
}

export interface CrmLead {
  id: string;
  /** Stable, human-readable lead number (1000+) → displayed as L-1000.
   *  Assigned by Supabase sequence on insert (phase31 SQL). */
  lead_no?: number | null;
  title: string;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_email?: string | null;
  linked_dealer_id: string | null;
  first_contact_date: string | null;
  expected_close_date: string | null;
  next_followup_date: string | null;
  machine_types: string[];
  next_activity: string | null;
  demo_has_run: "yes" | "no" | null;
  contact_type: string | null;
  customer_type: string | null;
  contact_information: string | null;
  trade_fair: string | null;
  country: string | null;
  notes: string | null;
  estimated_value: number | null;
  probability: number | null;
  pipeline_stage: PipelineStage;
  lost_competitor: string | null;
  lost_reason: string | null;
  lost_comment: string | null;
  attachments: CrmLeadAttachment[];
  status: string | null;
  /** Quantity (stk.) the user has explicitly moved into Arbejdsbudget for
   *  this lead. Independent from estimated_value — only this field affects
   *  the working forecast (CRM Budget). 0 / null = not in Arbejdsbudget. */
  move_to_working_qty?: number | null;
  /** Phase 38 — set after this lead has been converted into a demo lead. */
  converted_demo_lead_id?: string | null;
  /** Phase 40 — true when the lead was created via the configurator's
   *  "Save as lead" shortcut and still needs the seller to fill in the
   *  required CRM fields. Cleared automatically when the lead is saved
   *  through the normal CRM edit form. */
  incomplete_from_configurator?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface CrmDemoLead {
  id: string;
  /** Stable, human-readable demo number (8000+) → displayed as D-8000.
   *  Assigned by Supabase sequence on insert (phase31 SQL). */
  demo_no?: number | null;
  legacy_id?: string | null;
  title: string;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_email?: string | null;
  dealer_company: string | null;
  dealer_country?: string | null;
  dealer_rep: string | null;
  customer_name: string | null;
  customer_address: string | null;
  notes: string | null;
  machine_category: string[];
  demo_machine: string | null;
  demo_equipment: string[];
  demo_date: string | null;
  interest_level: number | null;
  wants_offer: "yes" | "no" | null;
  followup_date: string | null;
  estimated_value: number | null;
  probability: number | null;
  competitors_present: "yes" | "no" | null;
  competitor_name: string | null;
  notes_after_demo: string | null;
  result_status: string | null;
  attachments: CrmLeadAttachment[];
  created_at: string;
  source?: "user" | "seed";
  /** Phase 38 — when this demo lead was converted from a CRM lead, points
   *  back to the originating crm_leads.id. NULL for standalone demo leads. */
  source_lead_id?: string | null;
}

const LS_LEADS = "timan.crm.leads.v1";
const LS_DEMO  = "timan.crm.demoLeads.v1";
const LS_DELETED_LEADS = "timan.crm.leads.deletedIds.v1";
const LS_DELETED_DEMO = "timan.crm.demoLeads.deletedIds.v1";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readLS<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function writeLS<T>(key: string, rows: T[]): void {
  try { localStorage.setItem(key, JSON.stringify(rows.slice(0, 500))); } catch { /* */ }
}

function readDeletedIds(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function markDeletedId(key: string, id: string): void {
  try {
    const ids = readDeletedIds(key);
    ids.add(id);
    localStorage.setItem(key, JSON.stringify(Array.from(ids).slice(-1000)));
  } catch { /* */ }
}

function notifyCrmLeadsChanged(): void {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("timan:crm-leads-changed"));
    }
  } catch { /* */ }
}

// ---------- Human-readable lead/demo numbers ----------
// Authoritative numbers come from Supabase sequences (phase31 SQL).
// Helpers below also assign a stable local fallback for rows created while
// offline, or for legacy rows the SQL backfill hasn't reached yet. Once a
// row has a number it is never overwritten.

export const LEAD_NO_PREFIX = "L-";
export const LEGACY_LEAD_NO_PREFIX = "G-";
export const DEMO_NO_PREFIX = "D-";
const LEAD_NO_START = 1001;
const DEMO_NO_START = 8000;

export function formatLeadNo(n: number | null | undefined): string {
  if (n == null) return "—";
  return n >= 5000 ? `${LEGACY_LEAD_NO_PREFIX}${n}` : `${LEAD_NO_PREFIX}${n}`;
}
export function formatDemoNo(n: number | null | undefined): string {
  return n == null ? "—" : `${DEMO_NO_PREFIX}${n}`;
}

const LS_LEAD_LOCAL_NO = "timan.crm.leads.localNo.v1";
const LS_DEMO_LOCAL_NO = "timan.crm.demoLeads.localNo.v1";

function nextLocalNo(storageKey: string, start: number, seenMax: number): number {
  let cur = 0;
  try { cur = Number(localStorage.getItem(storageKey) || "0"); } catch { /* */ }
  const next = Math.max(cur + 1, seenMax + 1, start);
  try { localStorage.setItem(storageKey, String(next)); } catch { /* */ }
  return next;
}

function ensureLeadNumbers(rows: CrmLead[]): CrmLead[] {
  let seen = 0;
  for (const r of rows) if (typeof r.lead_no === "number" && r.lead_no > seen) seen = r.lead_no;
  for (const r of rows) {
    if (typeof r.lead_no !== "number" || r.lead_no <= 0) {
      r.lead_no = nextLocalNo(LS_LEAD_LOCAL_NO, LEAD_NO_START, seen);
      seen = r.lead_no;
    }
  }
  return rows;
}
function ensureDemoNumbers(rows: CrmDemoLead[]): CrmDemoLead[] {
  let seen = 0;
  for (const r of rows) if (typeof r.demo_no === "number" && r.demo_no > seen) seen = r.demo_no;
  for (const r of rows) {
    if (typeof r.demo_no !== "number" || r.demo_no <= 0) {
      r.demo_no = nextLocalNo(LS_DEMO_LOCAL_NO, DEMO_NO_START, seen);
      seen = r.demo_no;
    }
  }
  return rows;
}

// ---------- Leads ----------

export type NewCrmLead = Omit<CrmLead, "id" | "created_at" | "updated_at">;

function removeLeadFromLocalCache(id: string): void {
  writeLS<CrmLead>(LS_LEADS, readLS<CrmLead>(LS_LEADS).filter(r => r.id !== id));
}

function isUuid(value: string | null | undefined): boolean {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function createLead(input: NewCrmLead, opts: { requireRemote?: boolean } = {}): Promise<CrmLead> {
  const now = new Date().toISOString();
  const row: CrmLead = { ...input, id: uuid(), created_at: now, updated_at: now };

  // Pre-assign a stable local fallback lead_no based on what we've seen so
  // far (LS + seed). The Supabase sequence is authoritative — if the insert
  // succeeds we overwrite this with the real returned lead_no.
  const knownMax = Math.max(
    0,
    ...readLS<CrmLead>(LS_LEADS).map(r => r.lead_no || 0),
    ...seedOpenLeads().map(r => r.lead_no || 0),
  );
  row.lead_no = nextLocalNo(LS_LEAD_LOCAL_NO, LEAD_NO_START, knownMax);

  // Local cache first
  writeLS<CrmLead>(LS_LEADS, [row, ...readLS<CrmLead>(LS_LEADS)]);

  try {
    const { data, error } = await supabase.from("crm_leads").insert({
      id: row.id,
      title: row.title,
      owner_user_id: row.owner_user_id,
      owner_name: row.owner_name,
      owner_email: row.owner_email ?? null,
      linked_dealer_id: isUuid(row.linked_dealer_id) ? row.linked_dealer_id : null,
      first_contact_date: row.first_contact_date,
      expected_close_date: row.expected_close_date,
      next_followup_date: row.next_followup_date,
      machine_types: row.machine_types,
      next_activity: row.next_activity,
      demo_has_run: row.demo_has_run,
      contact_type: row.contact_type,
      customer_type: row.customer_type,
      contact_information: row.contact_information,
      trade_fair: row.trade_fair,
      country: row.country,
      notes: row.notes,
      estimated_value: row.estimated_value,
      probability: row.probability,
      pipeline_stage: row.pipeline_stage,
      lost_competitor: row.lost_competitor,
      lost_reason: row.lost_reason,
      lost_comment: row.lost_comment,
      attachments: row.attachments ?? [],
      status: row.status,
      move_to_working_qty: row.move_to_working_qty ?? 0,
      incomplete_from_configurator: row.incomplete_from_configurator ?? false,
    }).select("lead_no").maybeSingle();
    if (error) {
      notifyLocalFallback({ table: "crm_leads", action: "insert", error });
      if (opts.requireRemote) {
        removeLeadFromLocalCache(row.id);
        throw error;
      }
    }
    if (data && typeof (data as { lead_no?: number }).lead_no === "number") {
      row.lead_no = (data as { lead_no: number }).lead_no;
      // Sync the local row with the authoritative number.
      const ls = readLS<CrmLead>(LS_LEADS);
      const idx = ls.findIndex(r => r.id === row.id);
      if (idx >= 0) { ls[idx] = { ...ls[idx], lead_no: row.lead_no }; writeLS(LS_LEADS, ls); }
    }
  } catch (err) {
    notifyLocalFallback({ table: "crm_leads", action: "insert", error: err });
    if (opts.requireRemote) {
      removeLeadFromLocalCache(row.id);
      throw err;
    }
  }

  // Auto-log to activity feed → dashboard updates immediately.
  try {
    await logActivity({
      activity_type: row.pipeline_stage === "Won" ? "order_created"
                  : row.pipeline_stage === "Lost" ? "lead_rejected"
                  : "lead_created",
      title: row.title,
      description: `${row.customer_type || ""} · ${row.contact_type || ""}`.trim(),
      status: row.pipeline_stage,
      assigned_owner_user_id: row.owner_user_id,
      assigned_owner_name: row.owner_name,
      created_by_user_id: row.owner_user_id,
      created_by_name: row.owner_name,
      value: row.estimated_value,
      currency: "DKK",
      meta: {
        machine_types: row.machine_types,
        probability: row.probability,
        lost_reason: row.lost_reason,
        lost_competitor: row.lost_competitor,
      },
    });
  } catch { /* */ }

  return row;
}

export interface DeleteLeadAudit {
  title?: string | null;
  display_no?: string | null;
  customer?: string | null;
  dealer?: string | null;
  owner_user_id?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  machine?: string | null;
  value?: number | null;
  deleted_by_user_id?: string | null;
  deleted_by_name?: string | null;
  deleted_by_email?: string | null;
  deleted_by_role?: string | null;
}

export async function deleteLead(id: string, audit: DeleteLeadAudit = {}): Promise<{ error?: string }> {
  try {
    const { error } = await supabase.from("crm_leads").delete().eq("id", id);
    if (error) throw error;
    markDeletedId(LS_DELETED_LEADS, id);
    removeLeadFromLocalCache(id);
    notifyCrmLeadsChanged();
    try {
      await logActivity({
        activity_type: "lead_deleted",
        title: audit.title ? `Slettet lead: ${audit.title}` : "Slettet lead",
        description: [
          audit.display_no,
          audit.customer,
          audit.deleted_by_name ? `Slettet af: ${audit.deleted_by_name}` : null,
          audit.deleted_by_role ? `Rolle: ${audit.deleted_by_role}` : null,
        ].filter(Boolean).join(" · "),
        status: "Slettet",
        account_name: audit.dealer ?? null,
        assigned_owner_user_id: audit.owner_user_id ?? null,
        assigned_owner_name: audit.owner_name ?? null,
        created_by_user_id: audit.deleted_by_user_id ?? null,
        created_by_name: audit.deleted_by_name ?? audit.deleted_by_email ?? null,
        created_by_email: audit.deleted_by_email ?? null,
        value: audit.value ?? null,
        currency: audit.value != null ? "DKK" : null,
        meta: {
          deleted_entity: "crm_lead",
          deleted_lead_id: id,
          deleted_lead_no: audit.display_no,
          deleted_by_email: audit.deleted_by_email,
          deleted_by_role: audit.deleted_by_role,
          owner_email: audit.owner_email,
          machine: audit.machine,
        },
      });
    } catch { /* deletion already succeeded; activity logging is best-effort */ }
    return {};
  } catch (err) {
    notifyLocalFallback({ table: "crm_leads", action: "delete", error: err });
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export type CrmLeadPatch = Partial<Omit<CrmLead, "id" | "created_at">>;

/**
 * Update an existing lead by id.
 *
 * Strategy: patch local cache (so edits to seed/local rows survive a reload),
 * then attempt to update the row in Supabase. We do NOT create a new row —
 * if the id doesn't exist in Supabase yet (e.g. seed row) the update simply
 * affects 0 rows there, but the local override still wins on next listLeads().
 */
export async function updateLead(id: string, patch: CrmLeadPatch): Promise<CrmLead> {
  const now = new Date().toISOString();
  // Merge into LS (acts as override for seed rows too).
  const local = readLS<CrmLead>(LS_LEADS);
  const existingIdx = local.findIndex(r => r.id === id);
  let merged: CrmLead;
  if (existingIdx >= 0) {
    merged = { ...local[existingIdx], ...patch, id, updated_at: now } as CrmLead;
    local[existingIdx] = merged;
  } else {
    // Seed/Supabase row not yet in LS — pull current from listLeads cache via seed/sup
    const seeded = seedOpenLeads().find(r => r.id === id);
    let base: CrmLead | null = seeded || null;
    if (!base) {
      try {
        const { data } = await supabase.from("crm_leads").select("*").eq("id", id).maybeSingle();
        if (data) base = data as unknown as CrmLead;
      } catch { /* */ }
    }
    if (!base) throw new Error("Lead not found: " + id);
    merged = { ...base, ...patch, id, updated_at: now } as CrmLead;
    local.unshift(merged);
  }
  writeLS<CrmLead>(LS_LEADS, local);

  try {
    const { error } = await supabase.from("crm_leads").update({
      title: merged.title,
      owner_user_id: merged.owner_user_id,
      owner_name: merged.owner_name,
      linked_dealer_id: merged.linked_dealer_id,
      first_contact_date: merged.first_contact_date,
      expected_close_date: merged.expected_close_date,
      next_followup_date: merged.next_followup_date,
      machine_types: merged.machine_types,
      next_activity: merged.next_activity,
      demo_has_run: merged.demo_has_run,
      contact_type: merged.contact_type,
      customer_type: merged.customer_type,
      contact_information: merged.contact_information,
      trade_fair: merged.trade_fair,
      country: merged.country,
      notes: merged.notes,
      estimated_value: merged.estimated_value,
      probability: merged.probability,
      pipeline_stage: merged.pipeline_stage,
      lost_competitor: merged.lost_competitor,
      lost_reason: merged.lost_reason,
      lost_comment: merged.lost_comment,
      attachments: merged.attachments ?? [],
      status: merged.status,
      move_to_working_qty: merged.move_to_working_qty ?? 0,
      incomplete_from_configurator: merged.incomplete_from_configurator ?? false,
    }).eq("id", id);
    if (error) notifyLocalFallback({ table: "crm_leads", action: "update", error });
  } catch (err) {
    notifyLocalFallback({ table: "crm_leads", action: "update", error: err });
  }

  return merged;
}

/** Fetch a single lead by id from local override → supabase → seed. */
export async function getLead(id: string): Promise<CrmLead | null> {
  const local = readLS<CrmLead>(LS_LEADS).find(r => r.id === id);
  if (local) return ensureLeadNumbers([local])[0];
  try {
    const { data } = await supabase.from("crm_leads").select("*").eq("id", id).maybeSingle();
    if (data) return ensureLeadNumbers([data as unknown as CrmLead])[0];
  } catch { /* */ }
  const seeded = seedOpenLeads().find(r => r.id === id);
  return seeded ? ensureLeadNumbers([seeded])[0] : null;
}

export interface ListLeadsOpts { ownerUserId?: string | null; limit?: number }

function seedOpenLeads(): CrmLead[] {
  return (openLeadsSeed as unknown as (CrmLead & { owner_email?: string | null })[]).map(r => ({ ...r }));
}

function dedupOpenLeads(rows: (CrmLead & { legacy_id?: string | null })[]): CrmLead[] {
  const seen = new Set<string>();
  const out: CrmLead[] = [];
  for (const r of rows) {
    const k1 = (r as any).legacy_id ? `lid:${(r as any).legacy_id}` : "";
    const k2 = `t:${(r.title||"").toLowerCase()}|${r.first_contact_date||""}`;
    if (k1 && seen.has(k1)) continue;
    if (seen.has(k2)) continue;
    if (k1) seen.add(k1);
    seen.add(k2);
    out.push(r);
  }
  return out;
}

export async function listLeads(opts: ListLeadsOpts = {}): Promise<CrmLead[]> {
  const limit = opts.limit ?? 5000;
  let supRows: CrmLead[] = [];
  let remoteReadOk = false;
  try {
    let q = supabase.from("crm_leads").select("*").order("created_at", { ascending: false }).limit(limit);
    if (opts.ownerUserId) q = q.eq("owner_user_id", opts.ownerUserId);
    const { data, error } = await q;
    if (error) throw error;
    remoteReadOk = true;
    if (data) supRows = data as unknown as CrmLead[];
  } catch (err) {
    console.warn("[crm.listLeads] supabase failed → local fallback:", err);
  }
  const deletedIds = readDeletedIds(LS_DELETED_LEADS);
  supRows = supRows.filter((r) => !deletedIds.has(r.id));
  if (remoteReadOk) {
    const remoteOnly = ensureLeadNumbers([...supRows]);
    remoteOnly.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return remoteOnly.slice(0, limit);
  }
  const localRows = readLS<CrmLead>(LS_LEADS).filter((r) => !deletedIds.has(r.id));
  const seeded = seedOpenLeads().filter((r) => !deletedIds.has(r.id));
  let merged = dedupOpenLeads([...supRows, ...localRows, ...seeded] as any);
  if (opts.ownerUserId) merged = merged.filter(r => r.owner_user_id === opts.ownerUserId);
  merged.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  // Assign stable lead_no to any row missing one (older rows / offline-created),
  // then persist back so the same numbers stick across reloads.
  ensureLeadNumbers(merged);
  const ls = readLS<CrmLead>(LS_LEADS);
  const lsMap = new Map(ls.map(r => [r.id, r]));
  let lsChanged = false;
  for (const r of merged) {
    const ex = lsMap.get(r.id);
    if (ex) { if (ex.lead_no !== r.lead_no) { ex.lead_no = r.lead_no; lsChanged = true; } }
    else if (r.lead_no) { ls.push(r); lsChanged = true; }
  }
  if (lsChanged) writeLS(LS_LEADS, ls);
  return merged.slice(0, limit);
}

// ---------- Demo Leads ----------

export type NewCrmDemoLead = Omit<CrmDemoLead, "id" | "created_at">;

export async function createDemoLead(input: NewCrmDemoLead): Promise<CrmDemoLead> {
  const now = new Date().toISOString();
  const row: CrmDemoLead = { ...input, id: uuid(), created_at: now };

  // Stable local fallback demo_no — overwritten by Supabase if insert succeeds.
  const knownMax = Math.max(
    0,
    ...readLS<CrmDemoLead>(LS_DEMO).map(r => r.demo_no || 0),
    ...seedDemoRows().map(r => r.demo_no || 0),
  );
  row.demo_no = nextLocalNo(LS_DEMO_LOCAL_NO, DEMO_NO_START, knownMax);

  writeLS<CrmDemoLead>(LS_DEMO, [row, ...readLS<CrmDemoLead>(LS_DEMO)]);

  try {
    const { data, error } = await supabase.from("crm_demo_leads").insert({
      id: row.id,
      title: row.title,
      owner_user_id: row.owner_user_id,
      owner_name: row.owner_name,
      dealer_company: row.dealer_company,
      dealer_rep: row.dealer_rep,
      customer_name: row.customer_name,
      customer_address: row.customer_address,
      notes: row.notes,
      machine_category: row.machine_category,
      demo_machine: row.demo_machine,
      demo_equipment: row.demo_equipment,
      demo_date: row.demo_date,
      interest_level: row.interest_level,
      wants_offer: row.wants_offer,
      followup_date: row.followup_date,
      estimated_value: row.estimated_value,
      probability: row.probability,
      competitors_present: row.competitors_present,
      competitor_name: row.competitor_name,
      notes_after_demo: row.notes_after_demo,
      result_status: row.result_status,
      source_lead_id: row.source_lead_id ?? null,
    }).select("demo_no").maybeSingle();
    if (error) notifyLocalFallback({ table: "crm_demo_leads", action: "insert", error });
    if (data && typeof (data as { demo_no?: number }).demo_no === "number") {
      row.demo_no = (data as { demo_no: number }).demo_no;
      const ls = readLS<CrmDemoLead>(LS_DEMO);
      const idx = ls.findIndex(r => r.id === row.id);
      if (idx >= 0) { ls[idx] = { ...ls[idx], demo_no: row.demo_no }; writeLS(LS_DEMO, ls); }
    }
  } catch (err) {
    notifyLocalFallback({ table: "crm_demo_leads", action: "insert", error: err });
  }

  // Phase 38 — back-link the originating lead.
  if (row.source_lead_id) {
    try {
      const { error } = await supabase.from("crm_leads")
        .update({ converted_demo_lead_id: row.id })
        .eq("id", row.source_lead_id);
      if (error) {
        console.warn("[crm.createDemoLead] could not set converted_demo_lead_id", error);
        notifyLocalFallback({ table: "crm_leads", action: "update converted_demo_lead_id", error });
      }
      // Mirror on local cache so the link is visible immediately.
      const ls = readLS<CrmLead>(LS_LEADS);
      const idx = ls.findIndex(r => r.id === row.source_lead_id);
      if (idx >= 0) {
        ls[idx] = { ...ls[idx], converted_demo_lead_id: row.id, updated_at: now };
        writeLS(LS_LEADS, ls);
      }
    } catch (err) {
      console.warn("[crm.createDemoLead] back-link failed", err);
    }
  }


  try {
    await logActivity({
      activity_type: row.wants_offer === "yes" ? "lead_accepted" : "lead_created",
      title: `Demo: ${row.title}`,
      description: `${row.demo_machine || ""} · ${row.customer_name || ""}`.trim(),
      status: row.result_status,
      assigned_owner_user_id: row.owner_user_id,
      assigned_owner_name: row.owner_name,
      created_by_user_id: row.owner_user_id,
      created_by_name: row.owner_name,
      value: row.estimated_value,
      currency: "DKK",
      meta: { demo_equipment: row.demo_equipment, interest_level: row.interest_level },
    });
  } catch { /* */ }

  return row;
}

export async function deleteDemoLead(id: string, audit: DeleteLeadAudit = {}): Promise<{ error?: string }> {
  try {
    const { error } = await supabase.from("crm_demo_leads").delete().eq("id", id);
    if (error) throw error;
    markDeletedId(LS_DELETED_DEMO, id);
    writeLS<CrmDemoLead>(LS_DEMO, readLS<CrmDemoLead>(LS_DEMO).filter(r => r.id !== id));
    notifyCrmLeadsChanged();
    try {
      await logActivity({
        activity_type: "lead_deleted",
        title: audit.title ? `Slettet demo-lead: ${audit.title}` : "Slettet demo-lead",
        description: [
          audit.display_no,
          audit.customer,
          audit.deleted_by_name ? `Slettet af: ${audit.deleted_by_name}` : null,
          audit.deleted_by_role ? `Rolle: ${audit.deleted_by_role}` : null,
        ].filter(Boolean).join(" · "),
        status: "Slettet",
        account_name: audit.dealer ?? null,
        assigned_owner_user_id: audit.owner_user_id ?? null,
        assigned_owner_name: audit.owner_name ?? null,
        created_by_user_id: audit.deleted_by_user_id ?? null,
        created_by_name: audit.deleted_by_name ?? audit.deleted_by_email ?? null,
        created_by_email: audit.deleted_by_email ?? null,
        value: audit.value ?? null,
        currency: audit.value != null ? "DKK" : null,
        meta: {
          deleted_entity: "crm_demo_lead",
          deleted_lead_id: id,
          deleted_lead_no: audit.display_no,
          deleted_by_email: audit.deleted_by_email,
          deleted_by_role: audit.deleted_by_role,
          owner_email: audit.owner_email,
          machine: audit.machine,
        },
      });
    } catch { /* deletion already succeeded; activity logging is best-effort */ }
    return {};
  } catch (err) {
    notifyLocalFallback({ table: "crm_demo_leads", action: "delete", error: err });
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Seed rows imported from Machine_Demonstration.csv (real Timan demo history). */
function seedDemoRows(): CrmDemoLead[] {
  return (machineDemoSeed as unknown as CrmDemoLead[]).map(r => ({ ...r, source: "seed" as const }));
}

/** Dedup by legacy_id first, then by (customer_company + demo_date + demo_machine). */
function dedupDemoRows(rows: CrmDemoLead[]): CrmDemoLead[] {
  const seen = new Set<string>();
  const out: CrmDemoLead[] = [];
  for (const r of rows) {
    const k1 = r.legacy_id ? `lid:${r.legacy_id}` : "";
    const k2 = `cm:${(r.customer_name||"").toLowerCase()}|${r.demo_date||""}|${r.demo_machine||""}`;
    if (k1 && seen.has(k1)) continue;
    if (seen.has(k2)) continue;
    if (k1) seen.add(k1);
    seen.add(k2);
    out.push(r);
  }
  return out;
}

export async function listDemoLeads(opts: ListLeadsOpts = {}): Promise<CrmDemoLead[]> {
  const limit = opts.limit ?? 500;
  let supRows: CrmDemoLead[] = [];
  let remoteReadOk = false;
  try {
    let q = supabase.from("crm_demo_leads").select("*").order("created_at", { ascending: false }).limit(limit);
    if (opts.ownerUserId) q = q.eq("owner_user_id", opts.ownerUserId);
    const { data, error } = await q;
    if (error) throw error;
    remoteReadOk = true;
    if (data) supRows = data as unknown as CrmDemoLead[];
  } catch (err) {
    console.warn("[crm.listDemoLeads] supabase failed → local fallback:", err);
  }

  const deletedIds = readDeletedIds(LS_DELETED_DEMO);
  supRows = supRows.filter((r) => !deletedIds.has(r.id));
  if (remoteReadOk) {
    const remoteOnly = ensureDemoNumbers([...supRows]);
    if (opts.ownerUserId) {
      return remoteOnly
        .filter(r => r.owner_user_id === opts.ownerUserId)
        .sort((a, b) => (b.created_at || b.demo_date || "").localeCompare(a.created_at || a.demo_date || ""))
        .slice(0, limit);
    }
    remoteOnly.sort((a, b) => (b.created_at || b.demo_date || "").localeCompare(a.created_at || a.demo_date || ""));
    return remoteOnly.slice(0, limit);
  }
  const localRows = readLS<CrmDemoLead>(LS_DEMO).filter((r) => !deletedIds.has(r.id));
  const seeded = seedDemoRows().filter((r) => !deletedIds.has(r.id));
  // Merge order: user-created (supabase / local) first so they win on dedup.
  let merged = dedupDemoRows([...supRows, ...localRows, ...seeded]);

  if (opts.ownerUserId) {
    merged = merged.filter(r => r.owner_user_id === opts.ownerUserId);
  }
  // Sort newest first by created_at then demo_date.
  merged.sort((a, b) => (b.created_at || b.demo_date || "").localeCompare(a.created_at || a.demo_date || ""));
  // Stable demo_no for any rows missing one (legacy/seed/offline) — persisted to LS.
  ensureDemoNumbers(merged);
  const ls = readLS<CrmDemoLead>(LS_DEMO);
  const lsMap = new Map(ls.map(r => [r.id, r]));
  let lsChanged = false;
  for (const r of merged) {
    const ex = lsMap.get(r.id);
    if (ex) { if (ex.demo_no !== r.demo_no) { ex.demo_no = r.demo_no; lsChanged = true; } }
    else if (r.demo_no) { ls.push(r); lsChanged = true; }
  }
  if (lsChanged) writeLS(LS_DEMO, ls);
  return merged.slice(0, limit);
}

/**
 * Resolve seed rows that lack owner_user_id by looking up `owner_email` against
 * app_users. Backend role sees everything regardless. Used by activities feed
 * & seller performance so seed data attributes correctly.
 */
export async function resolveSeedOwners<T extends { owner_user_id: string | null; owner_email?: string | null }>(rows: T[]): Promise<T[]> {
  const emails = Array.from(new Set(rows.map(r => r.owner_email).filter(Boolean) as string[]));
  if (emails.length === 0) return rows;
  try {
    const { data } = await supabase.from("app_users").select("id,email").in("email", emails);
    const map = new Map<string, string>();
    (data || []).forEach((u: { id: string; email: string }) => map.set(u.email.toLowerCase(), u.id));
    return rows.map(r => r.owner_user_id ? r : ({ ...r, owner_user_id: map.get((r.owner_email||"").toLowerCase()) || null }));
  } catch {
    return rows;
  }
}

/** Synthesize CRM activities from demo lead rows for the activities feed/dashboard. */
export function demoLeadsToActivities(rows: CrmDemoLead[]): CrmActivity[] {
  return rows.map(r => ({
    id: `demo-act-${r.id}`,
    activity_type: "lead_created",
    activity_date: r.demo_date ? `${r.demo_date}T09:00:00.000Z` : (r.created_at || new Date().toISOString()),
    account_id: null,
    account_name: r.customer_name || r.dealer_company || null,
    created_by_user_id: r.owner_user_id,
    created_by_name: r.owner_name,
    assigned_owner_user_id: r.owner_user_id,
    assigned_owner_name: r.owner_name,
    title: `Demo: ${r.demo_machine || r.title}`,
    description: [r.customer_name, r.dealer_company, r.dealer_country].filter(Boolean).join(" · "),
    status: r.result_status,
    quote_id: null,
    order_id: null,
    configuration_id: null,
    value: r.estimated_value,
    currency: "DKK",
    meta: {
      legacy_id: r.legacy_id,
      demo_equipment: r.demo_equipment,
      machine_category: r.machine_category,
      country: r.dealer_country,
    },
    created_at: r.created_at || new Date().toISOString(),
  }));
}

// ─────────────────────────────────────────────────────────────
// Lead → Arbejdsbudget (working forecast) contributions
//
// A lead contributes to Arbejdsbudget ONLY when:
//   - move_to_working_qty > 0
//   - expected_close_date is a valid date (provides year + month)
//   - at least one machine_type matches a known budget product key
//
// Estimated_value / probability / pipeline_stage do NOT affect Arbejdsbudget.
// ─────────────────────────────────────────────────────────────

export interface LeadWorkingContribution {
  lead_id: string;
  lead_no: number | null;
  title: string;
  product_key: string;            // matched BUDGET_PRODUCTS key
  machine_label: string;          // raw machine_type string from the lead
  qty: number;                    // move_to_working_qty
  year: number;
  month_idx: number;              // 0..11
  expected_close_date: string | null;
  owner_user_id: string | null;
  owner_email: string | null;
  owner_name: string | null;
  dealer: string | null;          // linked_dealer_id (raw)
  customer: string | null;        // contact_information
}

function normalizeWorkingText(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

const WORKING_MACHINE_KEYS = BUDGET_PRODUCTS
  .filter((p) => p.category === "machine")
  .map((p) => p.key);

function matchMainProductKey(machineType: string): string | null {
  const raw = machineType || "";
  if (raw.trim().toLowerCase().startsWith("equipment:")) return null;
  const m = normalizeWorkingText(raw);
  if (!m) return null;
  if (m === "rc1000" || m === "rc1000s") return "RC-1000s";
  if (m === "new2620" || m === "timan2620") return "Timan 2620";
  for (const k of WORKING_MACHINE_KEYS) {
    if (m === normalizeWorkingText(k)) return k;
  }
  for (const k of WORKING_MACHINE_KEYS) {
    if (m.includes(normalizeWorkingText(k))) return k;
  }
  return null;
}

function matchEquipmentProductKey(machineType: string): { product_key: string; label: string } | null {
  const raw = machineType || "";
  if (!raw.trim().toLowerCase().startsWith("equipment:")) return null;
  const normalizedRaw = normalizeWorkingText(raw.replace(/^equipment:\s*/i, ""));
  for (const [machineKey, items] of Object.entries(EQUIPMENT_BY_MACHINE)) {
    const normalizedMachine = normalizeWorkingText(machineKey);
    if (!normalizedRaw.includes(normalizedMachine)) continue;
    for (const item of items) {
      if (item.isHeader) continue;
      const itemName = localizedName(item.name, "da");
      if (!itemName) continue;
      if (normalizedRaw.includes(normalizeWorkingText(itemName))) {
        return {
          product_key: `${machineKey}::${item.key}`,
          label: `${machineKey} - ${itemName}`,
        };
      }
    }
  }
  return null;
}

/** Convert a list of leads into per-(product,month) Arbejdsbudget contribs. */
export function buildLeadWorkingContributions(leads: CrmLead[]): LeadWorkingContribution[] {
  const out: LeadWorkingContribution[] = [];
  for (const l of leads) {
    const qty = Number(l.move_to_working_qty || 0);
    if (!qty || qty <= 0) continue;
    const iso = l.expected_close_date;
    if (!iso) continue;
    const d = new Date(iso);
    if (isNaN(d.getTime())) continue;
    const year = d.getUTCFullYear();
    const month_idx = d.getUTCMonth();
    const types = (l.machine_types || []).filter(Boolean);
    if (types.length === 0) continue;
    // One lead can add one working-budget item per selected machine or attachment.
    const seenProductKeys = new Set<string>();
    for (const t of types) {
      const equipmentMatch = matchEquipmentProductKey(t);
      const pk = equipmentMatch?.product_key || matchMainProductKey(t);
      if (!pk || seenProductKeys.has(pk)) continue;
      seenProductKeys.add(pk);
      out.push({
        lead_id: l.id,
        lead_no: typeof l.lead_no === "number" ? l.lead_no : null,
        title: l.title,
        product_key: pk,
        machine_label: equipmentMatch?.label || t,
        qty,
        year,
        month_idx,
        expected_close_date: iso,
        owner_user_id: l.owner_user_id,
        owner_email: l.owner_email || null,
        owner_name: l.owner_name,
        dealer: l.linked_dealer_id || null,
        customer: l.contact_information || null,
      });
    }
  }
  return out;
}
