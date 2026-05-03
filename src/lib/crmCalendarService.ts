/**
 * CRM Calendar — planned dealer activities.
 *
 * Source of truth: public.crm_calendar_activities (Phase 6 SQL).
 * Fallback: localStorage so the UI works in preview / before the table exists.
 *
 * Outlook / Microsoft Graph sync fields are reserved but not yet implemented.
 */
import { supabase } from "@/lib/supabase";
import type { Language } from "@/types/configurator";

export type CalendarActivityType =
  | "demo"
  | "budget_meeting"
  | "new_dealer_onboarding"
  | "service_training"
  | "sales_training"
  | "open_house"
  | "fair_help"
  | "andet";

export interface CalendarActivity {
  id: string;
  title: string;
  start_datetime: string;
  end_datetime: string | null;
  account_id: string | null;
  dealer_name: string | null;
  /** Snapshot of selected dealer_accounts row — does NOT reassign ownership. */
  dealer_account_number: string | null;
  dealer_assigned_seller_initials: string | null;
  dealer_assigned_seller_email: string | null;
  seller_user_id: string | null;
  seller_initials: string | null;
  seller_name: string | null;
  activity_type: CalendarActivityType;
  note: string | null;
  status: "planned" | "done" | "canceled";
  outlook_event_id: string | null;
  outlook_sync_status: string | null;
  outlook_last_synced_at: string | null;
  created_by_user_id: string | null;
  created_by_email: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewCalendarActivity {
  title: string;
  start_datetime: string;
  end_datetime?: string | null;
  account_id?: string | null;
  dealer_name?: string | null;
  dealer_account_number?: string | null;
  dealer_assigned_seller_initials?: string | null;
  dealer_assigned_seller_email?: string | null;
  seller_user_id?: string | null;
  seller_initials?: string | null;
  seller_name?: string | null;
  activity_type: CalendarActivityType;
  note?: string | null;
  status?: "planned" | "done" | "canceled";
  created_by_user_id?: string | null;
  created_by_email?: string | null;
}

const LS_KEY = "timan.crm.calendar.v1";
const MAX_LOCAL = 2000;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readLocal(): CalendarActivity[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? (p as CalendarActivity[]) : [];
  } catch { return []; }
}
function writeLocal(rows: CalendarActivity[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(0, MAX_LOCAL))); } catch { /* */ }
}

// ---------- Audit (best-effort, never throws) ----------
function audit(action: "create" | "update" | "delete", row: CalendarActivity, before?: CalendarActivity): void {
  try {
    const k = "timan.audit_log.v1";
    const raw = localStorage.getItem(k);
    const arr = raw ? JSON.parse(raw) : [];
    arr.unshift({
      id: `cal_${row.id}_${Date.now()}`,
      ts: new Date().toISOString(),
      user: row.seller_name || row.seller_initials || "—",
      action,
      module: "CRM Kalender",
      record: row.id,
      old_value: before ? JSON.stringify({ title: before.title, status: before.status }) : null,
      new_value: JSON.stringify({ title: row.title, status: row.status, type: row.activity_type }),
      ip: "—",
      status: "success",
    });
    localStorage.setItem(k, JSON.stringify(arr.slice(0, 500)));
  } catch { /* */ }
}

// ---------- CRUD ----------
export async function createActivity(input: NewCalendarActivity): Promise<CalendarActivity> {
  const now = new Date().toISOString();
  const row: CalendarActivity = {
    id: uuid(),
    title: input.title || "",
    start_datetime: input.start_datetime,
    end_datetime: input.end_datetime ?? null,
    account_id: input.account_id ?? null,
    dealer_name: input.dealer_name ?? null,
    seller_user_id: input.seller_user_id ?? null,
    seller_initials: input.seller_initials ?? null,
    seller_name: input.seller_name ?? null,
    activity_type: input.activity_type,
    note: input.note ?? null,
    status: input.status ?? "planned",
    outlook_event_id: null,
    outlook_sync_status: null,
    outlook_last_synced_at: null,
    created_by_user_id: input.created_by_user_id ?? null,
    updated_by_user_id: input.created_by_user_id ?? null,
    created_at: now,
    updated_at: now,
  };
  writeLocal([row, ...readLocal()]);
  try {
    const { error } = await supabase.from("crm_calendar_activities").insert(row);
    if (error) console.warn("[crmCalendar.create] supabase insert failed (kept local):", error.message);
  } catch (err) { console.warn("[crmCalendar.create] unexpected:", err); }
  audit("create", row);
  return row;
}

export async function updateActivity(id: string, patch: Partial<NewCalendarActivity & { status: CalendarActivity["status"] }>, updatedByUserId?: string | null): Promise<CalendarActivity | null> {
  const local = readLocal();
  const idx = local.findIndex(r => r.id === id);
  if (idx < 0) return null;
  const before = local[idx];
  const next: CalendarActivity = {
    ...before,
    ...patch,
    activity_type: (patch.activity_type ?? before.activity_type) as CalendarActivityType,
    end_datetime: patch.end_datetime ?? before.end_datetime,
    updated_by_user_id: updatedByUserId ?? before.updated_by_user_id,
    updated_at: new Date().toISOString(),
  };
  local[idx] = next;
  writeLocal(local);
  try {
    const { error } = await supabase.from("crm_calendar_activities").update({
      title: next.title,
      start_datetime: next.start_datetime,
      end_datetime: next.end_datetime,
      account_id: next.account_id,
      dealer_name: next.dealer_name,
      seller_user_id: next.seller_user_id,
      seller_initials: next.seller_initials,
      seller_name: next.seller_name,
      activity_type: next.activity_type,
      note: next.note,
      status: next.status,
      updated_by_user_id: next.updated_by_user_id,
      updated_at: next.updated_at,
    }).eq("id", id);
    if (error) console.warn("[crmCalendar.update] supabase update failed (kept local):", error.message);
  } catch (err) { console.warn("[crmCalendar.update] unexpected:", err); }
  audit("update", next, before);
  return next;
}

export async function deleteActivity(id: string): Promise<void> {
  const local = readLocal();
  const before = local.find(r => r.id === id);
  writeLocal(local.filter(r => r.id !== id));
  try {
    const { error } = await supabase.from("crm_calendar_activities").delete().eq("id", id);
    if (error) console.warn("[crmCalendar.delete] supabase delete failed (kept local):", error.message);
  } catch (err) { console.warn("[crmCalendar.delete] unexpected:", err); }
  if (before) audit("delete", before);
}

export interface ListCalendarOpts {
  sellerInitials?: string | null; // null/"all" → no filter
  sellerUserId?: string | null;
  accountId?: string | null;
  fromIso?: string | null;
  toIso?: string | null;
}

export async function listActivities(opts: ListCalendarOpts = {}): Promise<CalendarActivity[]> {
  // Try Supabase first
  try {
    let q = supabase.from("crm_calendar_activities").select("*").order("start_datetime", { ascending: true }).limit(2000);
    if (opts.sellerUserId) q = q.eq("seller_user_id", opts.sellerUserId);
    else if (opts.sellerInitials && opts.sellerInitials !== "all") q = q.eq("seller_initials", opts.sellerInitials);
    if (opts.accountId) q = q.eq("account_id", opts.accountId);
    if (opts.fromIso) q = q.gte("start_datetime", opts.fromIso);
    if (opts.toIso) q = q.lte("start_datetime", opts.toIso);
    const { data, error } = await q;
    if (error) throw error;
    if (data && data.length > 0) return data as unknown as CalendarActivity[];
  } catch (err) {
    console.warn("[crmCalendar.list] supabase failed → local fallback:", err);
  }
  // Local fallback
  let rows = readLocal();
  if (opts.sellerUserId) rows = rows.filter(r => r.seller_user_id === opts.sellerUserId);
  else if (opts.sellerInitials && opts.sellerInitials !== "all") rows = rows.filter(r => (r.seller_initials || "").toUpperCase() === opts.sellerInitials!.toUpperCase());
  if (opts.accountId) rows = rows.filter(r => r.account_id === opts.accountId);
  if (opts.fromIso) rows = rows.filter(r => r.start_datetime >= opts.fromIso!);
  if (opts.toIso) rows = rows.filter(r => r.start_datetime <= opts.toIso!);
  return rows.sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
}

// ---------- Activity types & colours ----------
export interface ActivityTypeMeta {
  key: CalendarActivityType;
  color: string;            // tailwind base
  dotClass: string;         // bg dot
  badgeClass: string;       // pill
  label: Record<Language, string>;
}

export const ACTIVITY_TYPES: ActivityTypeMeta[] = [
  { key: "demo",                   color: "blue",   dotClass: "bg-blue-500",    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    label: { da: "Demo", en: "Demo", de: "Demo", it: "Demo", hu: "Bemutató" } },
  { key: "budget_meeting",         color: "green",  dotClass: "bg-emerald-500", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    label: { da: "Budget møde", en: "Budget meeting", de: "Budget-Meeting", it: "Riunione budget", hu: "Költségvetési megbeszélés" } },
  { key: "new_dealer_onboarding",  color: "teal",   dotClass: "bg-teal-500",    badgeClass: "bg-teal-50 text-teal-700 border-teal-200",
    label: { da: "Ny forhandler opstart", en: "New dealer onboarding", de: "Neuer Händler Onboarding", it: "Avvio nuovo rivenditore", hu: "Új kereskedő indítás" } },
  { key: "service_training",       color: "purple", dotClass: "bg-purple-500",  badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
    label: { da: "Service træning", en: "Service training", de: "Service-Schulung", it: "Formazione assistenza", hu: "Szerviz tréning" } },
  { key: "sales_training",         color: "indigo", dotClass: "bg-indigo-500",  badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
    label: { da: "Salgs træning", en: "Sales training", de: "Verkaufstraining", it: "Formazione vendite", hu: "Értékesítési tréning" } },
  { key: "open_house",             color: "yellow", dotClass: "bg-yellow-500",  badgeClass: "bg-yellow-50 text-yellow-800 border-yellow-200",
    label: { da: "Åben hus", en: "Open house", de: "Tag der offenen Tür", it: "Open house", hu: "Nyílt nap" } },
  { key: "fair_help",              color: "orange", dotClass: "bg-orange-500",  badgeClass: "bg-orange-50 text-orange-800 border-orange-200",
    label: { da: "Messe hjælp", en: "Fair help", de: "Messe-Unterstützung", it: "Supporto fiera", hu: "Vásár segítség" } },
  { key: "andet",                  color: "gray",   dotClass: "bg-gray-400",    badgeClass: "bg-gray-100 text-gray-700 border-gray-200",
    label: { da: "Andet", en: "Other", de: "Sonstiges", it: "Altro", hu: "Egyéb" } },
];

export function activityTypeMeta(key: CalendarActivityType): ActivityTypeMeta {
  return ACTIVITY_TYPES.find(t => t.key === key) ?? ACTIVITY_TYPES[ACTIVITY_TYPES.length - 1];
}
