import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/context/AppUserContext";
import { canEditPartnerDataAccount } from "@/lib/partnerDataScope";

const contactWriteMigration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260928095222_allow_assigned_seller_dealer_contact_writes.sql",
  ),
  "utf8",
);
const effectiveWriteMigration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20261001235531_partnerdata_seller_effective_write_scope.sql",
  ),
  "utf8",
);
const helperGrantHardeningMigration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20261002002500_partnerdata_revoke_internal_helper_execute.sql",
  ),
  "utf8",
);
const internalMaintenanceMigration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20261002081241_allow_internal_timan_partnerdata_maintenance.sql",
  ),
  "utf8",
);

const seller = {
  id: "em-id",
  email: "em@timan.dk",
  dealer_number: "100",
} as SessionUser;

describe("dealer contact Partnerdata scope", () => {
  it("adds the stable assigned seller id to INSERT and both UPDATE checks", () => {
    expect(contactWriteMigration).toContain("create policy dealer_contacts_insert_scope");
    expect(contactWriteMigration).toContain("create policy dealer_contacts_update_scope");
    expect(contactWriteMigration.match(/da\.assigned_seller_id = actor\.id/g)).toHaveLength(3);
    expect(contactWriteMigration.match(/actor\.portal_role = 'timan_seller'/g)).toHaveLength(3);
    expect(contactWriteMigration).toMatch(/for update[\s\S]*using \([\s\S]*\)[\s\n]*with check \(/);
  });

  it("replaces seller ownership with canonical internal maintenance in current policies", () => {
    expect(internalMaintenanceMigration).toContain("create policy dealer_contacts_insert_scope");
    expect(internalMaintenanceMigration).toContain("create policy dealer_contacts_update_scope");
    expect(internalMaintenanceMigration).toContain("create policy dealer_contacts_delete_scope");
    expect(internalMaintenanceMigration.match(/public\.can_maintain_partnerdata\(\)/g)?.length).toBeGreaterThanOrEqual(7);
    expect(internalMaintenanceMigration.match(/da\.account_number = public\.current_user_dealer_number\(\)/g)).toHaveLength(4);
    expect(internalMaintenanceMigration).not.toMatch(/actor\.portal_role = 'timan_seller'[\s\S]*da\.assigned_seller_id = actor\.id/);
  });

  it("uses canonical effective identities for company, contact and View-as writes", () => {
    expect(effectiveWriteMigration).toContain("create or replace function public.partnerdata_effective_actor_id");
    expect(effectiveWriteMigration).toContain("create or replace function public.update_partnerdata_account_profile");
    expect(effectiveWriteMigration).toContain("create or replace function public.upsert_partnerdata_contact");
    expect(effectiveWriteMigration).toContain("create or replace function public.delete_partnerdata_contact");
    expect(effectiveWriteMigration).toContain("da.assigned_seller_id = actor.id");
    expect(effectiveWriteMigration).toContain("Only Timan Backend may use a View-as Partnerdata scope");
    expect(effectiveWriteMigration).toContain("'dealer_user'");
    expect(effectiveWriteMigration).not.toContain(
      "grant execute on function public.can_edit_partnerdata_account_as(uuid, uuid) to authenticated",
    );
    expect(helperGrantHardeningMigration).toContain(
      "revoke all on function public.partnerdata_effective_actor_id(uuid) from authenticated",
    );
    expect(helperGrantHardeningMigration).toContain(
      "revoke all on function public.can_edit_partnerdata_account_as(uuid, uuid) from authenticated",
    );
    expect(internalMaintenanceMigration).toContain("create or replace function public.can_maintain_partnerdata_as");
    expect(internalMaintenanceMigration).toContain("create or replace function public.partnerdata_effective_actor_id");
    expect(internalMaintenanceMigration).toContain("'timan_dealer', 'timan_importer', 'timan_service_partner'");
  });

  it("does not authorize a seller by legacy email or initials", () => {
    const authorizationBody = effectiveWriteMigration.match(
      /create or replace function public\.can_manage_partner_admin_fields[\s\S]*?\$\$;/,
    )?.[0] ?? "";
    expect(authorizationBody).toContain("actor.id = p_assigned_seller_id");
    expect(authorizationBody).not.toMatch(/actor\.email\s*=|actor\.initials\s*=/);
  });

  it("whitelists profile fields and rejects administrative ownership changes", () => {
    expect(internalMaintenanceMigration).toContain("Partnerdata field % is not writable through the profile flow");
    const profileWhitelist = internalMaintenanceMigration.match(
      /v_key = any \(array\[([\s\S]*?)\]::text\[\]\)/,
    )?.[1] ?? "";
    expect(profileWhitelist).not.toContain("assigned_seller_id");
    expect(profileWhitelist).not.toContain("account_number");
    expect(internalMaintenanceMigration).toContain("v_effective_actor_role not in ('timan_backend', 'timan_service')");
    expect(internalMaintenanceMigration).toContain("Financial Partnerdata fields require internal Backend access");
  });

  it("allows an internal seller to maintain own and cross-owner partner accounts", () => {
    expect(canEditPartnerDataAccount(seller, "timan_seller", "10092")).toBe(true);
    expect(canEditPartnerDataAccount(seller, "timan_seller", "10049")).toBe(true);
  });

  it("keeps Backend global and external users limited to their canonical dealer number", () => {
    expect(canEditPartnerDataAccount(seller, "timan_backend", "10049")).toBe(true);
    expect(canEditPartnerDataAccount(seller, "timan_dealer", "100")).toBe(true);
    expect(canEditPartnerDataAccount(seller, "timan_dealer", "10092")).toBe(false);
  });
});
