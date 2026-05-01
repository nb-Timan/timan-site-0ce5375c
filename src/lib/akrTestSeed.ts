/**
 * AKR demo/test data seeder — DISABLED.
 *
 * All demo data has been removed per cleanup request. The CRM now shows
 * empty states until real Supabase rows exist.
 *
 * Exports are kept (as empty values / no-ops) so existing imports continue
 * to compile and the previously-seeded localStorage entries are wiped on
 * next load.
 */

export interface AkrSeedAccount {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  country: string | null;
  preferred_language: string | null;
  role: string | null;
  partner_type: string | null;
  portal_role: string | null;
  dealer_number: string | null;
  status: string | null;
  account_owner_user_id: string | null;
  account_owner_name: string | null;
  account_owner_initials: string | null;
  account_owner_email: string | null;
  created_at: string | null;
  notes: string | null;
}

export const AKR_SEED_ACCOUNTS: AkrSeedAccount[] = [];

// Keys we want wiped from localStorage on next boot so previously-seeded
// demo rows disappear.
const DEMO_LS_KEYS = [
  "timan.akr.seed.version",
  "timan.crm.leads.v1",
  "timan.crm.demoLeads.v1",
  "timan.crm.activities.v1",
  "timan.crm.calendar.v1",
  "timan.crm.budget.lines.v6",
  "timan.crm.budget.forecasts.v6",
  "timan.crm.budget.actuals.v6",
  "timan.audit_log.v1",
  "timan.claims.local",
];

// Bump this when we want to force a re-clean in already-loaded browsers.
const CLEAN_FLAG = "timan.demo.cleanup.v2";

/** One-time clean of any seeded demo rows from previous builds. No-op afterwards. */
export function ensureAkrSeed(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(CLEAN_FLAG) === "1") return;
    for (const k of DEMO_LS_KEYS) {
      try { localStorage.removeItem(k); } catch { /* */ }
    }
    localStorage.setItem(CLEAN_FLAG, "1");
    // eslint-disable-next-line no-console
    console.info("[demo-cleanup] Removed legacy demo data from localStorage.");
  } catch (err) {
    console.warn("[demo-cleanup] failed:", err);
  }
}
