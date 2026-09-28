import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/context/AppUserContext";
import { canEditPartnerDataAccount } from "@/lib/partnerDataScope";

const migration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260928095222_allow_assigned_seller_dealer_contact_writes.sql",
  ),
  "utf8",
);

const seller = {
  id: "em-id",
  email: "em@timan.dk",
  dealer_number: "100",
} as SessionUser;

describe("dealer contact seller scope", () => {
  it("adds the stable assigned seller id to INSERT and both UPDATE checks", () => {
    expect(migration).toContain("create policy dealer_contacts_insert_scope");
    expect(migration).toContain("create policy dealer_contacts_update_scope");
    expect(migration.match(/da\.assigned_seller_id = actor\.id/g)).toHaveLength(3);
    expect(migration.match(/actor\.portal_role = 'timan_seller'/g)).toHaveLength(3);
    expect(migration).toMatch(/for update[\s\S]*using \([\s\S]*\)[\s\n]*with check \(/);
  });

  it("preserves Backend and external-dealer write branches without adding seller delete", () => {
    expect(migration.match(/public\.is_timan_backend\(\)/g)).toHaveLength(3);
    expect(migration.match(/da\.account_number = public\.current_user_dealer_number\(\)/g)).toHaveLength(3);
    expect(migration).not.toContain("dealer_contacts_delete_scope");
  });

  it("allows a real seller and Backend view-as only on the same assigned dealer id", () => {
    expect(canEditPartnerDataAccount(seller, "timan_seller", "10092", "em-id")).toBe(true);
    expect(canEditPartnerDataAccount(seller, "timan_seller", "10049", "bp-id")).toBe(false);
    expect(canEditPartnerDataAccount(seller, "timan_seller", "10092", null)).toBe(false);
  });

  it("keeps Backend global and external users limited to their canonical dealer number", () => {
    expect(canEditPartnerDataAccount(seller, "timan_backend", "10049", "bp-id")).toBe(true);
    expect(canEditPartnerDataAccount(seller, "timan_dealer", "100", null)).toBe(true);
    expect(canEditPartnerDataAccount(seller, "timan_dealer", "10092", null)).toBe(false);
  });
});
