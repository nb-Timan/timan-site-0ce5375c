#!/usr/bin/env node
/**
 * Live PostgREST authorization verification for public.app_users.
 *
 * Uses ONLY the public publishable (anon) key that already ships in the SPA —
 * exactly what an attacker in a browser has. Run BEFORE and AFTER applying
 * docs/sql/phase63_app_users_rls_hardening.sql.
 *
 *   node scripts/verify-app-users-rls.mjs
 *
 * Every check must report PASS after the migration. Nothing is written on a
 * correctly secured database; write probes target a random non-existent id and
 * an unroutable email so a failure (i.e. an insecure DB) cannot corrupt data.
 */

const URL_BASE =
  process.env.VITE_SUPABASE_URL ?? "https://rdodyoixxybiozvmuqon.supabase.co";
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!KEY) {
  console.error(
    "Missing publishable key. Set VITE_SUPABASE_PUBLISHABLE_KEY (the public anon key) and re-run.",
  );
  process.exit(2);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const REST = `${URL_BASE}/rest/v1`;
const FAKE_ID = "00000000-0000-4000-8000-000000000001";
const FAKE_EMAIL = `rls-probe-${Date.now()}@invalid.test`;

let failures = 0;
function report(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

/** A denial is any non-2xx, or a 2xx that returns zero rows / no effect. */
async function probe(name, path, init, { denyOnRows = true } = {}) {
  const res = await fetch(`${REST}${path}`, { headers: H, ...init });
  const text = await res.text();
  if (!res.ok) return report(name, true, `HTTP ${res.status}`);
  if (denyOnRows) {
    const empty = text.trim() === "" || text.trim() === "[]";
    return report(name, empty, empty ? "no rows" : `RETURNED DATA (${text.slice(0, 120)})`);
  }
  return report(name, false, `HTTP ${res.status} ${text.slice(0, 120)}`);
}

console.log(`\nProbing ${URL_BASE} as ANONYMOUS (publishable key only)\n`);

await probe("anon cannot list app_users", "/app_users?select=id,email&limit=5");
await probe("anon cannot read a single row", `/app_users?select=*&id=eq.${FAKE_ID}`);
await probe("anon cannot read emails", "/app_users?select=email&limit=1");
await probe("anon cannot insert", "/app_users", {
  method: "POST",
  headers: { ...H, Prefer: "return=representation" },
  body: JSON.stringify({ email: FAKE_EMAIL, full_name: "rls probe", approved: true, portal_role: "timan_backend" }),
});
await probe("anon cannot update portal_role", `/app_users?id=eq.${FAKE_ID}`, {
  method: "PATCH",
  headers: { ...H, Prefer: "return=representation" },
  body: JSON.stringify({ portal_role: "timan_backend", approved: true, is_active: true }),
});
await probe("anon cannot delete", `/app_users?id=eq.${FAKE_ID}`, {
  method: "DELETE",
  headers: { ...H, Prefer: "return=representation" },
});
await probe("anon cannot read the seller directory view", "/app_user_directory?select=*&limit=1");

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED — app_users is still exposed`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
