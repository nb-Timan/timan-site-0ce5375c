/**
 * CRM activities — append-only event stream for sales activity.
 *
 * Source of truth: public.crm_activities.
 * Fallback: localStorage so the UI never crashes when the table rejects a write.
 *
 * The live table schema uses the legacy account_* / assigned_owner_* columns.
 * Newer caller fields like dealer_* / seller_* are kept in the TypeScript API
 * for compatibility and are mirrored into meta unless they map cleanly.
 */
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export type CrmActivityType =
  | "quote_created"
  | "quote_sent"
  | "quote_revised"
  | "quote_deleted"
  | "order_created"
  | "order_sent"
  | "order_deleted"
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
  dealer_account_id?: string | null;
  dealer_number?: string | null;
  dealer_name?: string | null;
  seller_user_id?: string | null;
  seller_email?: string | null;
  seller_initials?: string | null;
  seller_name?: string | null;
  created_by_email?: string | null;
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

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

function errorDebug(error: unknown): SupabaseErrorLike {
  if (!error || typeof error !== "object") return { message: String(error ?? "Unknown error") };
  const e = error as Record<string, unknown>;
  return {
    code: typeof e.code === "string" ? e.code : undefined,
    message: typeof e.message === "string" ? e.message : undefined,
    details: typeof e.details === "string" || e.details === null ? (e.details as string | null) : undefined,
    hint: typeof e.hint === "string" || e.hint === null ? (e.hint as string | null) : undefined,
  };
}

function logInsertFailure(error: unknown, payload: Record<string, unknown>): void {
  const debug = errorDebug(error);
  console.error("[crm_activities] insert failed", {
    code: debug.code,
    message: debug.message,
    details: debug.details,
    hint: debug.hint,
    payload,
  });
}

function notifyActivitySyncFailure(error: unknown): void {
  const debug = errorDebug(error);
  try {
    toast.warning("Aktivitet kunne ikke synkroniseres", {
      description: [debug.code, debug.message, "crm_activities · insert"].filter(Boolean).join(" · "),
      duration: 8000,
    });
  } catch {
    /* toast unavailable — console.error above is authoritative */
  }
}

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function looksLikeEmail(value: string | null | undefined): boolean {
  return !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function withDefinedMeta(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function mapDbActivity(row: Record<string, unknown>): CrmActivity {
  const meta = (row.meta && typeof row.meta === "object" ? row.meta : null) as Record<string, unknown> | null;
  const createdByEmail =
    (row.created_by_email as string | null | undefined) ??
    metaString(meta, "created_by_email") ??
    metaString(meta, "legacy_created_by_email");
  return {
    id: String(row.id ?? ""),
    activity_type: row.activity_type as CrmActivityType,
    activity_date: String(row.activity_date ?? row.created_at ?? new Date().toISOString()),
    account_id: (row.account_id as string | null | undefined) ?? (row.dealer_account_id as string | null | undefined) ?? null,
    account_name: (row.account_name as string | null | undefined) ?? (row.dealer_name as string | null | undefined) ?? null,
    created_by_user_id: (row.created_by_user_id as string | null | undefined) ?? null,
    created_by_name: (row.created_by_name as string | null | undefined) ?? createdByEmail,
    assigned_owner_user_id: (row.assigned_owner_user_id as string | null | undefined) ?? (row.seller_user_id as string | null | undefined) ?? null,
    assigned_owner_name: (row.assigned_owner_name as string | null | undefined) ?? (row.seller_name as string | null | undefined) ?? (row.seller_initials as string | null | undefined) ?? null,
    title: (row.title as string | null | undefined) ?? null,
    description: (row.description as string | null | undefined) ?? null,
    status: (row.status as string | null | undefined) ?? null,
    quote_id: (row.quote_id as string | null | undefined) ?? null,
    order_id: (row.order_id as string | null | undefined) ?? null,
    configuration_id: (row.configuration_id as string | null | undefined) ?? null,
    value: (row.value as number | null | undefined) ?? (typeof meta?.value === "number" ? meta.value : null),
    currency: (row.currency as string | null | undefined) ?? (typeof meta?.currency === "string" ? meta.currency : null),
    meta,
    created_at: String(row.created_at ?? row.activity_date ?? new Date().toISOString()),
  };
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
  let insertFailureLogged = false;
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

  const inputMeta = input.meta ?? null;
  const createdByEmail = input.created_by_email ?? (looksLikeEmail(input.created_by_name) ? input.created_by_name ?? null : null);
  const accountId = input.account_id ?? input.dealer_account_id ?? metaString(inputMeta, "dealer_account_id");
  const accountName = input.account_name ?? input.dealer_name ?? metaString(inputMeta, "dealer_name");
  const assignedOwnerUserId = input.assigned_owner_user_id ?? input.seller_user_id ?? metaString(inputMeta, "seller_user_id");
  const assignedOwnerName = input.assigned_owner_name ?? input.seller_name ?? input.seller_initials ?? metaString(inputMeta, "seller_name") ?? metaString(inputMeta, "seller_initials");
  const meta = withDefinedMeta({
    ...(inputMeta ?? {}),
    dealer_account_id: input.dealer_account_id ?? metaString(inputMeta, "dealer_account_id") ?? undefined,
    dealer_number: input.dealer_number ?? metaString(inputMeta, "dealer_number") ?? undefined,
    dealer_name: input.dealer_name ?? metaString(inputMeta, "dealer_name") ?? undefined,
    seller_user_id: input.seller_user_id ?? metaString(inputMeta, "seller_user_id") ?? undefined,
    seller_email: input.seller_email ?? metaString(inputMeta, "seller_email") ?? undefined,
    seller_initials: input.seller_initials ?? metaString(inputMeta, "seller_initials") ?? undefined,
    seller_name: input.seller_name ?? metaString(inputMeta, "seller_name") ?? undefined,
    legacy_account_id: accountId ?? undefined,
    legacy_account_name: accountName ?? undefined,
    legacy_created_by_name: input.created_by_name ?? undefined,
    legacy_created_by_email: createdByEmail ?? undefined,
    created_by_email: createdByEmail ?? undefined,
    legacy_assigned_owner_user_id: assignedOwnerUserId ?? undefined,
    legacy_assigned_owner_name: assignedOwnerName ?? undefined,
    value: input.value ?? undefined,
    currency: input.currency ?? undefined,
  });

  const payload = {
    id: row.id,
    activity_type: row.activity_type,
    title: row.title,
    description: row.description,
    configuration_id: row.configuration_id,
    quote_id: row.quote_id,
    order_id: row.order_id,
    activity_date: row.activity_date,
    account_id: accountId,
    account_name: accountName,
    created_by_user_id: row.created_by_user_id,
    created_by_name: row.created_by_name,
    assigned_owner_user_id: assignedOwnerUserId,
    assigned_owner_name: assignedOwnerName,
    value: row.value,
    currency: row.currency,
    status: row.status,
    meta,
    created_at: row.created_at,
  };

  try {
    const { error } = await supabase.from("crm_activities").insert(payload);
    if (error) {
      logInsertFailure(error, payload);
      insertFailureLogged = true;
      if (opts.strict) {
        throw error;
      }
      notifyActivitySyncFailure(error);
    }
  } catch (err) {
    if (!insertFailureLogged) logInsertFailure(err, payload);
    if (opts.strict) {
      throw err;
    }
    notifyActivitySyncFailure(err);
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
    let q = supabase.from("crm_activities").select("*").order("created_at", { ascending: false }).limit(limit);
    if (opts.ownerUserId) q = q.eq("seller_user_id", opts.ownerUserId);
    if (opts.accountId) q = q.eq("account_id", opts.accountId);
    const { data, error } = await q;
    if (error) throw error;
    if (data && data.length > 0) return (data as Record<string, unknown>[]).map(mapDbActivity);
  } catch (err) {
    console.warn("[crm.listActivities] supabase failed → local fallback:", err);
  }

  const local = readLocal();
  let rows = local;
  if (opts.ownerUserId) rows = rows.filter((r) => r.assigned_owner_user_id === opts.ownerUserId);
  if (opts.accountId) rows = rows.filter((r) => r.account_id === opts.accountId);
  return rows.slice(0, limit);
}
