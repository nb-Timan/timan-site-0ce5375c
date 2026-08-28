/**
 * CRM Calendar — planned dealer activities.
 *
 * Source of truth: public.crm_calendar_activities (Phase 6 SQL).
 * Fallback: localStorage so the UI works in preview / before the table exists.
 *
 * Outlook / Microsoft Graph sync fields are reserved but not yet implemented.
 */
import { supabase } from "@/lib/supabase";
import { notifyLocalFallback } from "@/lib/persistenceWarning";
import { sellerInitialsMatch, normalizeSellerInitials } from "@/lib/sellerInitials";
import { BUDGET_SELLERS } from "@/lib/crmBudgetService";
import type { Language } from "@/types/configurator";

// ---------- n8n Outlook calendar sync (PRODUCTION webhook) ----------
// Sync runs for every Timan seller. user_email is resolved from app_users
// (by seller_user_id or by initials), falling back to a hardcoded map.
const N8N_CRM_CALENDAR_WEBHOOK_URL: string =
  (import.meta.env.VITE_N8N_CRM_CALENDAR_WEBHOOK_URL as string | undefined) ||
  "https://n8n.srv1509152.hstgr.cloud/webhook/fbfd673a-5225-4d86-bb8e-7aa639e1fc43";

const TIMAN_SELLER_EMAIL_FALLBACK: Record<string, string> = {
  NB: "nb@timan.dk",
  AKR: "akr@timan.dk",
  AK: "akr@timan.dk",
  BP: "bp@timan.dk",
  EM: "em@timan.dk",
  JTN: "jtn@timan.dk",
};

async function resolveActivityOwnerEmail(row: CalendarActivity): Promise<string | null> {
  // 1. Direct user_id relation → app_users.email
  if (row.seller_user_id) {
    try {
      const { data } = await supabase
        .from("app_users")
        .select("email")
        .eq("id", row.seller_user_id)
        .maybeSingle();
      if (data?.email) return String(data.email).toLowerCase();
    } catch (err) {
      console.warn("[n8n.crm_calendar] app_users lookup by id failed:", err);
    }
  }

  const initials = (row.seller_initials || "").trim().toUpperCase();

  // 2. Initials → app_users.email (try initials column then seller_code)
  if (initials) {
    try {
      const { data } = await supabase
        .from("app_users")
        .select("email, initials, seller_code")
        .or(`initials.eq.${initials},seller_code.eq.${initials}`)
        .limit(1)
        .maybeSingle();
      if (data?.email) return String(data.email).toLowerCase();
    } catch (err) {
      console.warn("[n8n.crm_calendar] app_users lookup by initials failed:", err);
    }
  }

  // 3. BUDGET_SELLERS map
  if (initials) {
    const hit = BUDGET_SELLERS.find(s => s.initials.toUpperCase() === initials);
    if (hit?.email) return hit.email.toLowerCase();
  }

  // 4. Other email fields on the row
  if (row.dealer_assigned_seller_email) return row.dealer_assigned_seller_email.toLowerCase();
  if (row.created_by_email) return row.created_by_email.toLowerCase();

  // 5. Hardcoded Timan fallback
  if (initials && TIMAN_SELLER_EMAIL_FALLBACK[initials]) {
    return TIMAN_SELLER_EMAIL_FALLBACK[initials];
  }
  return null;
}

function syncCrmActivityToN8n(row: CalendarActivity): void {
  try {
    if (!N8N_CRM_CALENDAR_WEBHOOK_URL) return;
    // Fire-and-forget; never block UI or Supabase save.
    void (async () => {
      try {
        const email = await resolveActivityOwnerEmail(row);
        if (!email) {
          console.warn("[n8n.crm_calendar] skipped — no user_email for activity", row.id);
          return;
        }
        const payload = {
          title: row.title || "",
          description: row.note || "Oprettet fra Timan CRM",
          start: row.start_datetime,
          end: row.end_datetime || row.start_datetime,
          user_email: email,
          activity_id: row.id,
          activity_type: row.activity_type,
          dealer_name: row.dealer_name,
        };
        const res = await fetch(N8N_CRM_CALENDAR_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          console.error("[n8n.crm_calendar] webhook returned", res.status, res.statusText);
        }
      } catch (err) {
        console.error("[n8n.crm_calendar] webhook POST failed:", err);
      }
    })();
  } catch (err) {
    console.error("[n8n.crm_calendar] sync error (non-blocking):", err);
  }
}

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
  /** All sellers (including owner) that should see this activity. Phase 30. */
  participant_seller_initials: string[];
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
  participant_seller_initials?: string[] | null;
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
    dealer_account_number: input.dealer_account_number ?? null,
    dealer_assigned_seller_initials: input.dealer_assigned_seller_initials ?? null,
    dealer_assigned_seller_email: input.dealer_assigned_seller_email ?? null,
    seller_user_id: input.seller_user_id ?? null,
    seller_initials: input.seller_initials ?? null,
    seller_name: input.seller_name ?? null,
    participant_seller_initials: normalizeParticipants(input.participant_seller_initials, input.seller_initials),
    activity_type: input.activity_type,
    note: input.note ?? null,
    status: input.status ?? "planned",
    outlook_event_id: null,
    outlook_sync_status: null,
    outlook_last_synced_at: null,
    created_by_user_id: input.created_by_user_id ?? null,
    created_by_email: input.created_by_email ?? null,
    updated_by_user_id: input.created_by_user_id ?? null,
    created_at: now,
    updated_at: now,
  };
  writeLocal([row, ...readLocal()]);
  try {
    const { error } = await supabase.from("crm_calendar_activities").insert(row);
    if (error && isUndefinedColumn(error, "participant_seller_initials")) {
      // Phase 30 SQL not yet applied — retry without the new column.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { participant_seller_initials: _ignored, ...legacy } = row;
      const retry = await supabase.from("crm_calendar_activities").insert(legacy);
      if (retry.error) notifyLocalFallback({ table: "crm_calendar_activities", action: "insert", error: retry.error });
    } else if (error) {
      notifyLocalFallback({ table: "crm_calendar_activities", action: "insert", error });
    }
  } catch (err) { notifyLocalFallback({ table: "crm_calendar_activities", action: "insert", error: err }); }
  audit("create", row);
  syncCrmActivityToN8n(row);
  return row;
}

function normalizeParticipants(list: string[] | null | undefined, owner: string | null | undefined): string[] {
  const set = new Set<string>();
  for (const v of list ?? []) {
    const k = (v || "").trim().toUpperCase();
    if (k) set.add(k);
  }
  const o = (owner || "").trim().toUpperCase();
  if (o) set.add(o);
  return Array.from(set);
}

function isUndefinedColumn(err: unknown, col: string): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42703") return true;
  return typeof e.message === "string" && e.message.toLowerCase().includes(col.toLowerCase()) && /column|does not exist|unknown/i.test(e.message);
}

export async function updateActivity(id: string, patch: Partial<NewCalendarActivity & { status: CalendarActivity["status"] }>, updatedByUserId?: string | null): Promise<CalendarActivity | null> {
  const local = readLocal();
  const idx = local.findIndex(r => r.id === id);
  if (idx < 0) return null;
  const before = local[idx];
  const ownerInitials = (patch.seller_initials ?? before.seller_initials) ?? null;
  const next: CalendarActivity = {
    ...before,
    ...patch,
    activity_type: (patch.activity_type ?? before.activity_type) as CalendarActivityType,
    end_datetime: patch.end_datetime ?? before.end_datetime,
    participant_seller_initials: normalizeParticipants(
      patch.participant_seller_initials ?? before.participant_seller_initials,
      ownerInitials,
    ),
    updated_by_user_id: updatedByUserId ?? before.updated_by_user_id,
    updated_at: new Date().toISOString(),
  };
  local[idx] = next;
  writeLocal(local);
  const updatePayload = {
    title: next.title,
    start_datetime: next.start_datetime,
    end_datetime: next.end_datetime,
    account_id: next.account_id,
    dealer_name: next.dealer_name,
    dealer_account_number: next.dealer_account_number,
    dealer_assigned_seller_initials: next.dealer_assigned_seller_initials,
    dealer_assigned_seller_email: next.dealer_assigned_seller_email,
    seller_user_id: next.seller_user_id,
    seller_initials: next.seller_initials,
    seller_name: next.seller_name,
    participant_seller_initials: next.participant_seller_initials,
    activity_type: next.activity_type,
    note: next.note,
    status: next.status,
    updated_by_user_id: next.updated_by_user_id,
    updated_at: next.updated_at,
  };
  try {
    const { error } = await supabase.from("crm_calendar_activities").update(updatePayload).eq("id", id);
    if (error && isUndefinedColumn(error, "participant_seller_initials")) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { participant_seller_initials: _ignored, ...legacy } = updatePayload;
      const retry = await supabase.from("crm_calendar_activities").update(legacy).eq("id", id);
      if (retry.error) notifyLocalFallback({ table: "crm_calendar_activities", action: "update", error: retry.error });
    } else if (error) {
      notifyLocalFallback({ table: "crm_calendar_activities", action: "update", error });
    }
  } catch (err) { notifyLocalFallback({ table: "crm_calendar_activities", action: "update", error: err }); }
  audit("update", next, before);
  syncCrmActivityToN8n(next);
  return next;
}

export async function deleteActivity(id: string): Promise<void> {
  const local = readLocal();
  const before = local.find(r => r.id === id);
  writeLocal(local.filter(r => r.id !== id));
  try {
    const { error } = await supabase.from("crm_calendar_activities").delete().eq("id", id);
    if (error) notifyLocalFallback({ table: "crm_calendar_activities", action: "delete", error });
  } catch (err) { notifyLocalFallback({ table: "crm_calendar_activities", action: "delete", error: err }); }
  if (before) audit("delete", before);
}

export interface ListCalendarOpts {
  sellerInitials?: string | null; // null/"all" → no filter
  sellerUserId?: string | null;
  accountId?: string | null;
  accountIds?: string[] | null;
  fromIso?: string | null;
  toIso?: string | null;
}

export async function listActivities(opts: ListCalendarOpts = {}): Promise<CalendarActivity[]> {
  const wantInitials = opts.sellerInitials && opts.sellerInitials !== "all" ? opts.sellerInitials : null;
  // Try Supabase first
  try {
    let q = supabase.from("crm_calendar_activities").select("*").order("start_datetime", { ascending: true }).limit(2000);
    if (opts.sellerUserId) q = q.eq("seller_user_id", opts.sellerUserId);
    else if (wantInitials) {
      // Owner OR participant array contains the seller initials.
      // Expand AK ↔ AKR so both alias variants are matched server-side.
      const canonical = normalizeSellerInitials(wantInitials);
      const aliases = canonical === "AK" ? ["AK", "AKR"] : [wantInitials];
      const orParts: string[] = [];
      for (const a of aliases) {
        orParts.push(`seller_initials.eq.${a}`);
        orParts.push(`participant_seller_initials.cs.{${a}}`);
      }
      q = q.or(orParts.join(","));
    }
    if (opts.accountId) q = q.eq("account_id", opts.accountId);
    else if (opts.accountIds && opts.accountIds.length > 0) q = q.in("account_id", opts.accountIds);
    if (opts.fromIso) q = q.gte("start_datetime", opts.fromIso);
    if (opts.toIso) q = q.lte("start_datetime", opts.toIso);
    const { data, error } = await q;
    if (error) {
      // Phase 30 column missing → retry with owner-only filter.
      if (wantInitials && isUndefinedColumn(error, "participant_seller_initials")) {
        let q2 = supabase.from("crm_calendar_activities").select("*").order("start_datetime", { ascending: true }).limit(2000);
        q2 = q2.eq("seller_initials", wantInitials);
        if (opts.accountId) q2 = q2.eq("account_id", opts.accountId);
        else if (opts.accountIds && opts.accountIds.length > 0) q2 = q2.in("account_id", opts.accountIds);
        if (opts.fromIso) q2 = q2.gte("start_datetime", opts.fromIso);
        if (opts.toIso) q2 = q2.lte("start_datetime", opts.toIso);
        const retry = await q2;
        if (!retry.error && retry.data) return retry.data as unknown as CalendarActivity[];
      }
      throw error;
    }
    if (data && data.length > 0) return data as unknown as CalendarActivity[];
  } catch (err) {
    console.warn("[crmCalendar.list] supabase failed → local fallback:", err);
  }
  // Local fallback
  let rows = readLocal();
  if (opts.sellerUserId) rows = rows.filter(r => r.seller_user_id === opts.sellerUserId);
  else if (wantInitials) {
    rows = rows.filter(r => {
      if (sellerInitialsMatch(r.seller_initials, wantInitials)) return true;
      const parts = r.participant_seller_initials || [];
      return parts.some(p => sellerInitialsMatch(p, wantInitials));
    });
  }
  if (opts.accountId) rows = rows.filter(r => r.account_id === opts.accountId);
  else if (opts.accountIds && opts.accountIds.length > 0) {
    const ids = new Set(opts.accountIds);
    rows = rows.filter(r => !!r.account_id && ids.has(r.account_id));
  }
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

/** Returns owner + participants merged & deduped (uppercased initials). Used in display. */
export function activityAllSellerInitials(a: Pick<CalendarActivity, "seller_initials" | "participant_seller_initials">): string[] {
  const set = new Set<string>();
  const o = (a.seller_initials || "").trim().toUpperCase();
  if (o) set.add(o);
  for (const p of a.participant_seller_initials || []) {
    const k = (p || "").trim().toUpperCase();
    if (k) set.add(k);
  }
  return Array.from(set);
}
