/**
 * CRM Leads & Demo Leads service.
 *
 * Source of truth: public.crm_leads / public.crm_demo_leads (Supabase).
 * Fallback: localStorage so the UI keeps working during preview / when the
 * tables haven't been provisioned yet — mirrors the pattern in
 * crmActivitiesService.ts.
 */
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/crmActivitiesService";

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

export interface CrmLead {
  id: string;
  title: string;
  owner_user_id: string | null;
  owner_name: string | null;
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
  attachments: { name: string; size: number }[];
  status: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmDemoLead {
  id: string;
  title: string;
  owner_user_id: string | null;
  owner_name: string | null;
  dealer_company: string | null;
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
  attachments: { name: string; size: number }[];
  created_at: string;
}

const LS_LEADS = "timan.crm.leads.v1";
const LS_DEMO  = "timan.crm.demoLeads.v1";

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

// ---------- Leads ----------

export type NewCrmLead = Omit<CrmLead, "id" | "created_at" | "updated_at">;

export async function createLead(input: NewCrmLead): Promise<CrmLead> {
  const now = new Date().toISOString();
  const row: CrmLead = { ...input, id: uuid(), created_at: now, updated_at: now };
  // Local cache first
  writeLS<CrmLead>(LS_LEADS, [row, ...readLS<CrmLead>(LS_LEADS)]);

  try {
    const { error } = await supabase.from("crm_leads").insert({
      id: row.id,
      title: row.title,
      owner_user_id: row.owner_user_id,
      owner_name: row.owner_name,
      linked_dealer_id: row.linked_dealer_id,
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
      status: row.status,
    });
    if (error) console.warn("[crm.createLead] supabase insert failed (kept local):", error.message);
  } catch (err) {
    console.warn("[crm.createLead] unexpected (kept local):", err);
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

export interface ListLeadsOpts { ownerUserId?: string | null; limit?: number }

export async function listLeads(opts: ListLeadsOpts = {}): Promise<CrmLead[]> {
  const limit = opts.limit ?? 200;
  try {
    let q = supabase.from("crm_leads").select("*").order("created_at", { ascending: false }).limit(limit);
    if (opts.ownerUserId) q = q.eq("owner_user_id", opts.ownerUserId);
    const { data, error } = await q;
    if (error) throw error;
    if (data && data.length > 0) return data as unknown as CrmLead[];
  } catch (err) {
    console.warn("[crm.listLeads] supabase failed → local fallback:", err);
  }
  let rows = readLS<CrmLead>(LS_LEADS);
  if (opts.ownerUserId) rows = rows.filter(r => r.owner_user_id === opts.ownerUserId);
  return rows.slice(0, limit);
}

// ---------- Demo Leads ----------

export type NewCrmDemoLead = Omit<CrmDemoLead, "id" | "created_at">;

export async function createDemoLead(input: NewCrmDemoLead): Promise<CrmDemoLead> {
  const now = new Date().toISOString();
  const row: CrmDemoLead = { ...input, id: uuid(), created_at: now };
  writeLS<CrmDemoLead>(LS_DEMO, [row, ...readLS<CrmDemoLead>(LS_DEMO)]);

  try {
    const { error } = await supabase.from("crm_demo_leads").insert({
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
    });
    if (error) console.warn("[crm.createDemoLead] supabase insert failed (kept local):", error.message);
  } catch (err) {
    console.warn("[crm.createDemoLead] unexpected (kept local):", err);
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

export async function listDemoLeads(opts: ListLeadsOpts = {}): Promise<CrmDemoLead[]> {
  const limit = opts.limit ?? 200;
  try {
    let q = supabase.from("crm_demo_leads").select("*").order("created_at", { ascending: false }).limit(limit);
    if (opts.ownerUserId) q = q.eq("owner_user_id", opts.ownerUserId);
    const { data, error } = await q;
    if (error) throw error;
    if (data && data.length > 0) return data as unknown as CrmDemoLead[];
  } catch (err) {
    console.warn("[crm.listDemoLeads] supabase failed → local fallback:", err);
  }
  let rows = readLS<CrmDemoLead>(LS_DEMO);
  if (opts.ownerUserId) rows = rows.filter(r => r.owner_user_id === opts.ownerUserId);
  return rows.slice(0, limit);
}
