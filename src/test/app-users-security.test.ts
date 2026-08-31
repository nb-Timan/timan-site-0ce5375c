/**
 * Security regression tests for public.app_users authorization.
 *
 * These are STATIC guards: they assert that no client-side code path can
 * write privileged app_users columns. The live PostgREST verification lives
 * in `scripts/verify-app-users-rls.mjs` (run against the real project with
 * the publishable key only).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const SRC = join(process.cwd(), "src");
const files = walk(SRC);

describe("app_users client-side write paths", () => {
  it("no browser code inserts, upserts, updates or deletes app_users", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Find `.from("app_users")` / `.from('app_users')` followed by a write.
      const re = /from\(\s*['"]app_users['"]\s*\)\s*\.\s*(insert|upsert|update|delete)\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) offenders.push(`${f.replace(SRC, "src")}: .${m[1]}()`);
    }
    expect(offenders).toEqual([]);
  });

  it("backendUsersService saves through the admin-user-actions Edge Function", () => {
    const src = readFileSync(join(SRC, "lib/backendUsersService.ts"), "utf8");
    expect(src).toContain("adminUpdateAppUser");
  });

  it("auth linking goes through the Edge Function, not the browser", () => {
    const src = readFileSync(join(SRC, "lib/linkAuthUser.ts"), "utf8");
    expect(src).toContain("linkSelfAppUser");
    expect(src).not.toMatch(/auth_user_id:\s*authUid/);
  });

  it("the seller directory reads the minimal view, not raw app_users", () => {
    const src = readFileSync(join(SRC, "lib/sellerDirectory.ts"), "utf8");
    expect(src).toContain("app_user_directory");
    expect(src).toContain("id,email,initials,full_name,portal_role,company,phone");
  });
});

describe("phase63 migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "docs/sql/phase63_app_users_rls_hardening.sql"),
    "utf8",
  );

  it("revokes anon access", () => {
    expect(sql).toMatch(/revoke all on public\.app_users from anon/i);
  });

  it("creates the trusted backend helper", () => {
    expect(sql).toMatch(/create or replace function public\.is_backend/i);
    expect(sql).toMatch(/set search_path = public, auth/i);
  });

  it("contains no permissive policy bodies", () => {
    const policySection = sql.split("-- 4) Policies")[1] ?? "";
    expect(policySection).not.toMatch(/using \(true\)/i);
    expect(policySection).not.toMatch(/with check \(true\)/i);
  });

  it("guards protected columns with a trigger", () => {
    expect(sql).toMatch(/app_users_guard_protected_columns/);
    for (const col of [
      "portal_role", "permissions", "allowed_modules", "allowed_areas",
      "is_active", "approved", "auth_user_id", "user_id",
    ]) {
      expect(sql).toContain(`'${col}'`);
    }
  });
});
