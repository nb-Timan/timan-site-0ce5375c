/**
 * CRM / Sales Portal scope helpers.
 *
 * Foundation only — used to filter dealers/importers/service partners/dealer
 * users and offers/orders so a Timan Sælger sees ONLY their assigned
 * accounts. Backend / Service / read-only roles are unaffected.
 *
 * Wire this into list pages later when the CRM area is built. The data model
 * is provisioned by docs/sql/phase3_crm_account_owner.sql.
 */
import { PortalRole } from "@/lib/portalAccess";

export interface AccountLike {
  id: string;
  account_owner_user_id?: string | null;
}

export interface OfferOrderLike {
  id: string;
  assigned_seller_id?: string | null;
  created_by?: string | null; // legacy fallback (configurations.created_by)
}

export interface SellerScope {
  /** UUID of the Timan Sælger the current session belongs to (app_users.id). */
  sellerId: string | null;
  /** Portal role of the current user. */
  role: PortalRole | null;
  /** Allow-list of additional account ids the seller may also see. */
  extraAccountIds?: string[];
}

/** Roles that are restricted to their own assigned accounts in the CRM. */
export function isScopedSeller(role: PortalRole | null): boolean {
  return role === "timan_seller";
}

/** External roles that may use the limited CRM when granted CRM access. */
export function isExternalCrmRole(role: PortalRole | null): boolean {
  return (
    role === "timan_importer" ||
    role === "timan_dealer" ||
    role === "timan_service_partner" ||
    role === "dealer_user"
  );
}

export function canUseCrm(role: PortalRole | null): boolean {
  return isCrmAdmin(role) || isScopedSeller(role) || isExternalCrmRole(role);
}

/** Roles that can see everything in the CRM (no scoping). */
export function isCrmAdmin(role: PortalRole | null): boolean {
  return role === "timan_backend" || role === "timan_service";
}

export function canSellerSeeAccount(scope: SellerScope, account: AccountLike): boolean {
  if (isCrmAdmin(scope.role)) return true;
  if (!isScopedSeller(scope.role)) return false; // dealer-side roles never use CRM
  if (!scope.sellerId) return false;
  if (account.account_owner_user_id === scope.sellerId) return true;
  if (scope.extraAccountIds?.includes(account.id)) return true;
  return false;
}

export function normalizeDealerNumber(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isDealerNumberAllowed(value: string | null | undefined, dealerNumbers?: string[] | null): boolean {
  const n = normalizeDealerNumber(value);
  if (!n) return false;
  return new Set((dealerNumbers ?? []).map(normalizeDealerNumber).filter(Boolean)).has(n);
}

export function canSellerSeeOffer(scope: SellerScope, offer: OfferOrderLike): boolean {
  if (isCrmAdmin(scope.role)) return true;
  if (!isScopedSeller(scope.role)) return false;
  if (!scope.sellerId) return false;
  return offer.assigned_seller_id === scope.sellerId || offer.created_by === scope.sellerId;
}

/** Filter helpers for list pages. */
export function filterAccountsForSeller<T extends AccountLike>(scope: SellerScope, rows: T[]): T[] {
  if (isCrmAdmin(scope.role)) return rows;
  if (!isScopedSeller(scope.role)) return [];
  return rows.filter((r) => canSellerSeeAccount(scope, r));
}

export function filterOffersForSeller<T extends OfferOrderLike>(scope: SellerScope, rows: T[]): T[] {
  if (isCrmAdmin(scope.role)) return rows;
  if (!isScopedSeller(scope.role)) return [];
  return rows.filter((r) => canSellerSeeOffer(scope, r));
}
