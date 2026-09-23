import { describe, expect, it } from "vitest";
import { filterBackendUsers, type BackendUserListFilters } from "@/lib/backendUserListFilters";
import type { BackendUser } from "@/lib/backend-users-store";
import type { DealerAccount } from "@/lib/dealerAccountsService";

const users = [
  {
    id: "akr",
    name: "Alexander Kirschner",
    email: "alexander@timan.dk",
    company: "Tiefel GmbH",
    company_dealer: "Tiefel Landtechnik",
    dealer_number: "10458",
    country: "DE",
    role: "timan_seller",
    status: "active",
  },
  {
    id: "pending",
    name: "Mette Nielsen",
    email: "mette@example.dk",
    company: "Nord Maskiner",
    company_dealer: null,
    dealer_number: "20001",
    country: "DK",
    role: "dealer_user",
    status: "pending",
  },
] as BackendUser[];

const dealers = [
  { account_number: "10458", company_name: "Tiefel Landtechnik GmbH" },
  { account_number: "20001", company_name: "Nord Maskiner A/S" },
] as DealerAccount[];

const defaults: BackendUserListFilters = {
  query: "",
  role: "all",
  dealerNumber: "all",
  country: "all",
  status: "all",
};

describe("Backend user list filters", () => {
  it.each([
    ["alex", "akr"],
    ["TIMAN.DK", "akr"],
    ["tiefel land", "akr"],
    ["1045", "akr"],
    ["nord mask", "pending"],
  ])("searches name, email, dealer and account number with partial case-insensitive matching", (query, id) => {
    expect(filterBackendUsers(users, dealers, { ...defaults, query }).map((user) => user.id)).toEqual([id]);
  });

  it("combines role, dealer, country and status with AND semantics", () => {
    expect(filterBackendUsers(users, dealers, {
      query: "tiefel",
      role: "timan_seller",
      dealerNumber: "10458",
      country: "DE",
      status: "active",
    }).map((user) => user.id)).toEqual(["akr"]);

    expect(filterBackendUsers(users, dealers, {
      query: "tiefel",
      role: "timan_seller",
      dealerNumber: "10458",
      country: "DK",
      status: "active",
    })).toEqual([]);
  });

  it("returns the full authorized input list after reset", () => {
    expect(filterBackendUsers(users, dealers, defaults)).toEqual(users);
  });
});
