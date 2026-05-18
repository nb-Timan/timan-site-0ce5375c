/**
 * CRM activities — append-only event stream for sales activity.
 *
 * Source of truth: public.crm_activities (Phase 4 SQL).
 * Fallback: localStorage so the UI never crashes when the table is missing.
 *
 * Activities are written from the React app at the moment a quote/order is
 * created, sent or modified, plus on login. Reads are scoped on the client
 * via crmScope.ts (Timan Sælger sees only their own assigned accounts).
 */
import { supabase } from "@/lib/supabase";
import { notifyLocalFallback } from "@/lib/persistenceWarning";

export type CrmActivityType =
  | "quote_created"
  | "quote_sent"
  | "quote_revised"
  | "order_created"
  | "order_sent"
  | "discount_changed"
  | "delivery_changed"
  | "comment"
  | "login"
  | "lead_created"
  | "lead_viewed"
  | "lead_accepted"
  | "lead_rejected";

export interface CrmActivity {
  id: string;
  activity_type: CrmActivityType;
  activity_date: string;
  account_id: string | null;
  account_name: string | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  assigned_owner_user_id: string | null;
  assigned_owner_name: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  quote_id: string | null;
  order_id: string | null;
  configuration_id: string | null;
  value: number | null;
  currency: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface NewCrmActivity {
  activity_type: CrmActivityType;
  account_id?: string | null;
  account_name?: string | null;
  created_by_user_id?: string | null;
  created_by_name?: string | null;
  assigned_owner_user_id?: string | null;
  assigned_owner_name?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  quote_id?: string | null;
  order_id?: string | null;
  configuration_id?: string | null;
  value?: number | null;
  currency?: string | null;
  meta?: Record<string, unknown> | null;
}

const LS_KEY = "timan.crm.activities.v1";
const MAX_LOCAL = 500;

function readLocal(): CrmActivity[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CrmActivity[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(rows: CrmActivity[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(0, MAX_LOCAL)));
  } catch {
    /* quota — ignore */
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface LogActivityOptions {
  /**
   * When true:
   *  - Do NOT show the "Gemt lokalt" fallback toast (which is misleading
   *    for send-order/send-quote flows that have their own success state).
   *  - Throw on Supabase failure so the caller can react explicitly.
   *  - Still mirrors to localStorage as a backup, but never claims the
   *    server save succeeded when it didn't.
   */
  strict?: boolean;
}

/** Append a new activity. Best-effort by default. Use { strict: true } for
 *  order/quote send flows where a silent local fallback would be misleading. */
export async function logActivity(
  input: NewCrmActivity,
  opts: LogActivityOptions = {},
): Promise<CrmActivity> {
  const now = new Date().toISOString();
  const row: CrmActivity = {
    id: uuid(),
    activity_type: input.activity_type,
    activity_date: now,
    account_id: input.account_id ?? null,
    account_name: input.account_name ?? null,
    created_by_user_id: input.created_by_user_id ?? null,
    created_by_name: input.created_by_name ?? null,
    assigned_owner_user_id: input.assigned_owner_user_id ?? null,
    assigned_owner_name: input.assigned_owner_name ?? null,
    title: input.title ?? null,
    description: input.description ?? null,
    status: input.status ?? null,
    quote_id: input.quote_id ?? null,
    order_id: input.order_id ?? null,
    configuration_id: input.configuration_id ?? null,
    value: input.value ?? null,
    currency: input.currency ?? null,
    meta: input.meta ?? null,
    created_at: now,
  };

  // Always cache locally first so the dashboard reflects activity even when
  // the network round-trip is slow or the table is missing.
  const local = readLocal();
  writeLocal([row, ...local]);

  const payload = {
    id: row.id,
    activity_type: row.activity_type,
    activity_date: row.activity_date,
    account_id: row.account_id,
    account_name: row.account_name,
    created_by_user_id: row.created_by_user_id,
    created_by_name: row.created_by_name,
    assigned_owner_user_id: row.assigned_owner_user_id,
    assigned_owner_name: row.assigned_owner_name,
    title: row.title,
    description: row.description,
    status: row.status,
    quote_id: row.quote_id,
    order_id: row.order_id,
    configuration_id: row.configuration_id,
    value: row.value,
    currency: row.currency,
    meta: row.meta,
  };

  try {
    const { error } = await supabase.from("crm_activities").insert(payload);
    if (error) {
      if (opts.strict) {
        console.error("[crm.logActivity] strict insert failed:", { error, payload });
        throw error;
      }
      notifyLocalFallback({ table: "crm_activities", action: "insert", error });
    }
  } catch (err) {
    if (opts.strict) {
      console.error("[crm.logActivity] strict insert threw:", { err, payload });
      throw err;
    }
    notifyLocalFallback({ table: "crm_activities", action: "insert", error: err });
  }
  return row;
}

export interface ListActivitiesOpts {
  ownerUserId?: string | null;
  accountId?: string | null;
  limit?: number;
}

export async function listActivities(opts: ListActivitiesOpts = {}): Promise<CrmActivity[]> {
  const limit = opts.limit ?? 200;
  try {
    let q = supabase.from("crm_activities").select("*").order("activity_date", { ascending: false }).limit(limit);
    if (opts.ownerUserId) q = q.eq("assigned_owner_user_id", opts.ownerUserId);
    if (opts.accountId) q = q.eq("account_id", opts.accountId);
    const { data, error } = await q;
    if (error) throw error;
    if (data && data.length > 0) return data as unknown as CrmActivity[];
  } catch (err) {
    console.warn("[crm.listActivities] supabase failed → local fallback:", err);
  }

  const local = readLocal();
  let rows = local;
  if (opts.ownerUserId) rows = rows.filter((r) => r.assigned_owner_user_id === opts.ownerUserId);
  if (opts.accountId) rows = rows.filter((r) => r.account_id === opts.accountId);
  return rows.slice(0, limit);
}
