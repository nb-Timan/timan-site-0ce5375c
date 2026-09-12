import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260912202812_canonical_dealer_warranty_pending_submission.sql",
  "utf8",
);

describe("dealer warranty pending submission workflow", () => {
  it("keeps dealer input outside the approved machine and warranty register", () => {
    expect(migration).toContain("create table if not exists public.warranty_submissions");
    expect(migration).toContain("submission_status text not null default 'pending'");
    expect(migration).toContain("Approved entries are materialized only in warranty_registrations");

    const submitFunction = migration.match(
      /create function public\.create_scoped_portal_warranty_registration[\s\S]*?\n\$dealer_warranty_submit\$;/,
    )?.[0] ?? "";
    expect(submitFunction).toContain("insert into public.warranty_submissions");
    expect(submitFunction).not.toContain("insert into public.warranty_registrations");
  });

  it("derives the dealer from authenticated identity and only lets internal warranty users approve", () => {
    expect(migration).toContain("v_user.portal_role <> 'timan_dealer'::public.portal_role");
    expect(migration).toContain("v_user.dealer_number");
    expect(migration).toContain("public.is_timan_global_warranty()");
    expect(migration).toContain("Not authorised to approve warranty submissions");
    expect(migration).toContain(
      "revoke execute on function public.create_scoped_portal_warranty_registration(jsonb) from anon",
    );
  });

  it("allocates SP only at approval, preserves an existing MO row, and blocks duplicate SP approval", () => {
    const approveFunction = migration.match(
      /create or replace function public\.approve_pending_portal_warranty_submission[\s\S]*?\n\$dealer_warranty_approve\$;/,
    )?.[0] ?? "";
    expect(approveFunction).toContain("This serial already has an approved SP warranty");
    expect(approveFunction).toContain("warranty_sp_number_seq");
    expect(approveFunction).toContain("v_sp_number := 'SP-' || nextval");
    expect(approveFunction).toContain("submission_status = 'approved'");
    expect(approveFunction).toContain("machine_order_reference");
    expect(approveFunction).not.toContain("legacy_warranty_reference =");
  });

  it("keeps pending submissions out of the approved register's read path", () => {
    expect(migration).toContain("warranty_submissions_internal_select");
    expect(migration).toContain("warranty_submissions_scoped_select");
    expect(migration).toContain("warranty_submissions_one_pending_serial_per_dealer");
  });
});
