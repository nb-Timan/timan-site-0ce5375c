import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc },
}));

import { updateDealerAccount } from "@/lib/dealerAccountsService";
import { deleteDealerContact, upsertDealerContact } from "@/lib/dealerContactsService";

describe("Partnerdata scoped write services", () => {
  beforeEach(() => rpc.mockReset());

  it("sends company profile writes with the effective seller id", async () => {
    rpc.mockResolvedValue({
      data: { id: "dealer-10570", account_number: "10570", company_name: "Ad. Bachmann AG", city: "Tägerschen" },
      error: null,
    });

    const result = await updateDealerAccount("dealer-10570", { city: "Tägerschen" }, "akr-id");

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("update_partnerdata_account_profile", {
      p_dealer_account_id: "dealer-10570",
      p_patch: { city: "Tägerschen" },
      p_effective_user_id: "akr-id",
    });
  });

  it("surfaces an out-of-scope server rejection without falling back to a direct write", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "outside the effective user scope" } });

    await expect(updateDealerAccount("bp-dealer", { city: "Blocked" }, "akr-id")).resolves.toEqual({
      ok: false,
      error: "Du har ikke adgang til at rette denne partnerkonto.",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("persists contact role and first-contact state through the scoped RPC", async () => {
    rpc.mockResolvedValue({
      data: {
        id: "qa-contact",
        dealer_account_id: "dealer-10570",
        contact_area: "sales",
        role_title: "Sælger",
        name: "QA Seller Access Test",
        email: "qa-seller-access@example.invalid",
        phone: null,
        is_primary: true,
        created_at: "2026-10-02T00:00:00Z",
        updated_at: "2026-10-02T00:00:00Z",
      },
      error: null,
    });

    const result = await upsertDealerContact({
      id: "qa-contact",
      dealer_account_id: "dealer-10570",
      contact_area: "sales",
      role_title: "Sælger",
      name: "QA Seller Access Test",
      email: "qa-seller-access@example.invalid",
      is_primary: true,
    }, "akr-id");

    expect(result.row?.is_primary).toBe(true);
    expect(rpc).toHaveBeenCalledWith("upsert_partnerdata_contact", expect.objectContaining({
      p_contact_id: "qa-contact",
      p_dealer_account_id: "dealer-10570",
      p_effective_user_id: "akr-id",
      p_is_primary: true,
      p_role_title: "Sælger",
    }));
  });

  it("reuses the same create id for rapid retries of one logical contact", async () => {
    const createId = "4f274a77-6598-4b61-9ba6-d5a5135159de";
    const row = {
      id: createId,
      dealer_account_id: "dealer-10570",
      contact_area: "sales",
      role_title: "Sælger",
      name: "QA Partnerdata Contact Test",
      email: "qa-partnerdata-contact@example.invalid",
      phone: null,
      is_primary: false,
      created_at: "2026-10-04T00:00:00Z",
      updated_at: "2026-10-04T00:00:00Z",
    };
    rpc.mockResolvedValue({ data: row, error: null });

    const input = {
      createId,
      dealer_account_id: "dealer-10570",
      contact_area: "sales" as const,
      role_title: "Sælger",
      name: "QA Partnerdata Contact Test",
      email: "qa-partnerdata-contact@example.invalid",
    };
    const [first, retry] = await Promise.all([
      upsertDealerContact(input, "akr-id"),
      upsertDealerContact(input, "akr-id"),
    ]);

    expect(first.row?.id).toBe(createId);
    expect(retry.row?.id).toBe(createId);
    expect(rpc).toHaveBeenCalledTimes(2);
    for (const [, args] of rpc.mock.calls) {
      expect(args).toEqual(expect.objectContaining({
        p_contact_id: null,
        p_create_id: createId,
        p_dealer_account_id: "dealer-10570",
        p_effective_user_id: "akr-id",
      }));
    }
  });

  it("deletes only through the scoped contact RPC", async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    await expect(deleteDealerContact("qa-contact", "akr-id")).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("delete_partnerdata_contact", {
      p_contact_id: "qa-contact",
      p_effective_user_id: "akr-id",
    });
  });
});
