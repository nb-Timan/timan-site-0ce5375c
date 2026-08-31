import type { BackendUser } from "@/lib/backend-users-store";
import type { DealerAccount, UpdateDealerAccountPatch } from "@/lib/dealerAccountsService";
import {
  getPartnerAccountTypeLabel,
  resolvePartnerAccountType,
  type PartnerAccountTypeId,
} from "@/lib/partnerAccountTypes";
import { sellerInitialsMatch } from "@/lib/sellerInitials";

export type PartnerAdminSellerOption = Pick<BackendUser, "id" | "email" | "initials" | "name" | "phone">;

export function resolvePartnerAdminSeller<T extends Pick<BackendUser, "id" | "email" | "initials">>(
  dealer: Pick<DealerAccount, "assigned_seller_id" | "assigned_seller_email" | "assigned_seller_initials">,
  sellers: T[],
): T | null {
  if (dealer.assigned_seller_id) {
    const byId = sellers.find((seller) => seller.id === dealer.assigned_seller_id);
    if (byId) return byId;
  }

  if (dealer.assigned_seller_email) {
    const byEmail = sellers.find((seller) => seller.email.toLowerCase() === dealer.assigned_seller_email?.toLowerCase());
    if (byEmail) return byEmail;
  }

  if (dealer.assigned_seller_initials) {
    const byInitials = sellers.find((seller) => sellerInitialsMatch(seller.initials, dealer.assigned_seller_initials));
    if (byInitials) return byInitials;
  }

  return null;
}

export function buildPartnerAdminSellerState(
  dealer: Pick<DealerAccount, "assigned_seller_id" | "assigned_seller_email" | "assigned_seller_initials" | "assigned_seller_name">,
  sellers: PartnerAdminSellerOption[],
) {
  const initialSeller = resolvePartnerAdminSeller(dealer, sellers);
  return {
    seller_id: initialSeller?.id || dealer.assigned_seller_id || "",
    assigned_seller_id: initialSeller?.id || dealer.assigned_seller_id || "",
    assigned_seller_initials: initialSeller?.initials || dealer.assigned_seller_initials || "",
    assigned_seller_name: initialSeller?.name || dealer.assigned_seller_name || "",
    assigned_seller_email: initialSeller?.email || dealer.assigned_seller_email || "",
  };
}

export function buildPartnerAdminSellerOptions(
  current: ReturnType<typeof buildPartnerAdminSellerState>,
  sellers: PartnerAdminSellerOption[],
): PartnerAdminSellerOption[] {
  const byId = new Map(sellers.map((seller) => [seller.id, seller]));
  if (current.assigned_seller_id && !byId.has(current.assigned_seller_id)) {
    byId.set(current.assigned_seller_id, {
      id: current.assigned_seller_id,
      initials: current.assigned_seller_initials || "—",
      name: current.assigned_seller_name || current.assigned_seller_email || current.assigned_seller_initials || "Ukendt sælger",
      email: current.assigned_seller_email || "",
      phone: null,
    });
  }
  return Array.from(byId.values()).sort((a, b) => a.initials.localeCompare(b.initials) || a.name.localeCompare(b.name));
}

export function getInitialPartnerAdminType(
  dealer: Pick<DealerAccount, "customer_type" | "customer_type_label" | "dealer_type">,
): PartnerAccountTypeId {
  return resolvePartnerAccountType(dealer);
}

export function buildPartnerAdminTypePatch(type: PartnerAccountTypeId | ""): Pick<
  UpdateDealerAccountPatch,
  "dealer_type" | "customer_type" | "customer_type_label"
> {
  if (!type) {
    return {
      dealer_type: null,
      customer_type: null,
      customer_type_label: null,
    };
  }
  const label = getPartnerAccountTypeLabel(type, "da");
  return {
    dealer_type: type,
    customer_type: label,
    customer_type_label: label,
  };
}
