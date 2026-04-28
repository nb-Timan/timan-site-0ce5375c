/**
 * CRM logins — append-only login event stream.
 *
 * Source of truth: public.crm_logins (Phase 4 SQL).
 * Fallback: localStorage so the UI never crashes when the table is missing.
 */
import { supabase } from "@/lib/supabase";

export interface CrmLogin {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  account_id: string | null;
  account_name: string | null;
  login_date: string;
  ip_placeholder: string | null;
  device_placeholder: string | null;
}

export interface NewCrmLogin {
  user_id?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  ip_placeholder?: string | null;
  device_placeholder?: string | null;
}

const LS_KEY = "timan.crm.logins.v1";
const MAX_LOCAL = 500;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `lg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readLocal(): CrmLogin[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as CrmLogin[]) : [];
  } catch { return []; }
}
function writeLocal(rows: CrmLogin[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(0, MAX_LOCAL))); } catch { /* */ }
}

export async function logLogin(input: NewCrmLogin): Promise<CrmLogin> {
  const row: CrmLogin = {
    id: uuid(),
    user_id: input.user_id ?? null,
    user_name: input.user_name ?? null,
    user_email: input.user_email ?? null,
    account_id: input.account_id ?? null,
    account_name: input.account_name ?? null,
    login_date: new Date().toISOString(),
    ip_placeholder: input.ip_placeholder ?? null,
    device_placeholder: input.device_placeholder ?? typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : null,
  };

  writeLocal([row, ...readLocal()]);

  try {
    const { error } = await supabase.from("crm_logins").insert({
      id: row.id,
      user_id: row.user_id,
      user_name: row.user_name,
      user_email: row.user_email,
      account_id: row.account_id,
      account_name: row.account_name,
      login_date: row.login_date,
      ip_placeholder: row.ip_placeholder,
      device_placeholder: row.device_placeholder,
    });
    if (error) console.warn("[crm.logLogin] supabase insert failed (kept local):", error.message);
  } catch (err) {
    console.warn("[crm.logLogin] unexpected (kept local):", err);
  }
  return row;
}

export interface ListLoginsOpts { ownerUserId?: string | null; accountId?: string | null; limit?: number }

export async function listLogins(opts: ListLoginsOpts = {}): Promise<CrmLogin[]> {
  const limit = opts.limit ?? 200;
  try {
    let q = supabase.from("crm_logins").select("*").order("login_date", { ascending: false }).limit(limit);
    if (opts.accountId) q = q.eq("account_id", opts.accountId);
    const { data, error } = await q;
    if (error) throw error;
    if (data) {
      let rows = data as unknown as CrmLogin[];
      // Owner filter happens after the join is missing — we look up account ownership in CRM service.
      if (opts.ownerUserId) {
        // We don't have owner on logins; the caller is expected to pre-filter
        // by account_id list. Return as-is here.
      }
      if (rows.length > 0) return rows;
    }
  } catch (err) {
    console.warn("[crm.listLogins] supabase failed → local fallback:", err);
  }
  let rows = readLocal();
  if (opts.accountId) rows = rows.filter((r) => r.account_id === opts.accountId);
  return rows.slice(0, limit);
}
