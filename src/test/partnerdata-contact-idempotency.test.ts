import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261004082018_partnerdata_contact_save_idempotency.sql",
  "utf8",
);

describe("Partnerdata contact server idempotency", () => {
  it("uses a stable create UUID and the canonical primary-key conflict target", () => {
    expect(migration).toContain("p_create_id uuid default null");
    expect(migration).toContain("on conflict (id) do nothing");
    expect(migration).toContain("where id = p_create_id");
    expect(migration).not.toContain("on conflict (email)");
    expect(migration).not.toContain("lower(trim(email))");
  });

  it("locks retries, preserves account identity, and skips unchanged updates", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("v_existing.dealer_account_id <> p_dealer_account_id");
    expect(migration).toContain("v_existing.contact_area is distinct from p_contact_area");
    expect(migration).toContain("v_existing.is_primary is distinct from coalesce(p_is_primary, false)");
  });

  it("keeps the scoped authorization and explicit execute grants", () => {
    expect(migration).toContain("public.partnerdata_effective_actor_id(p_effective_user_id)");
    expect(migration).toContain("public.can_edit_partnerdata_account_as(p_dealer_account_id, v_effective_actor_id)");
    expect(migration).toContain("to authenticated, service_role");
  });
});
