import type { BackendUser, UserStatus } from "@/lib/backend-users-store";
import type { DealerAccount } from "@/lib/dealerAccountsService";
import type { PortalRole } from "@/lib/portalAccess";

export interface BackendUserListFilters {
  query: string;
  role: PortalRole | "all";
  dealerNumber: string | "all";
  country: string | "all";
  status: UserStatus | "all";
}

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("da-DK");
}

export function filterBackendUsers(
  users: readonly BackendUser[],
  dealers: readonly DealerAccount[],
  filters: BackendUserListFilters,
): BackendUser[] {
  const dealersByAccount = new Map(
    dealers.map((dealer) => [normalize(dealer.account_number), dealer]),
  );
  const query = normalize(filters.query);

  return users.filter((user) => {
    if (filters.role !== "all" && user.role !== filters.role) return false;
    if (filters.dealerNumber !== "all" && normalize(user.dealer_number) !== normalize(filters.dealerNumber)) return false;
    if (filters.country !== "all" && normalize(user.country) !== normalize(filters.country)) return false;
    if (filters.status !== "all" && user.status !== filters.status) return false;
    if (!query) return true;

    const dealer = user.dealer_number
      ? dealersByAccount.get(normalize(user.dealer_number))
      : undefined;
    const searchable = [
      user.name,
      user.email,
      user.company,
      user.company_dealer,
      user.dealer_number,
      dealer?.company_name,
      dealer?.account_number,
    ];

    return searchable.some((value) => normalize(value).includes(query));
  });
}
