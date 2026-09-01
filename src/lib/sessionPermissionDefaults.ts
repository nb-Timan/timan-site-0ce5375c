/**
 * Role-based defaults for permission columns that may be NULL in app_users.
 *
 * Historically `can_view_prices` and `can_submit_order` defaulted to `false`
 * when the column was null/undefined. That broke dealer-side portal users
 * (Timan Forhandler / Importør / Service Partner / dealer_user) whose rows
 * were created without these flags — they couldn't see prices in the
 * configurator basket even though their role normally allows it.
 *
 * These helpers apply safe defaults based on `portal_role` (or legacy
 * `role` + `partner_type`) when the explicit DB value is null/undefined.
 * An explicit `false` from the DB is still respected (admin override).
 */

const PRICE_VISIBLE_PORTAL_ROLES = new Set([
  "timan_backend",
  "timan_seller",
  "timan_service",
  "timan_dealer",
  "timan_importer",
  "timan_service_partner",
  "dealer_customer",
]);

const ORDER_ALLOWED_PORTAL_ROLES = new Set([
  "timan_backend",
  "timan_seller",
  "timan_dealer",
  "timan_importer",
  "timan_service_partner",
]);

function isDealerSideLegacy(role: unknown, partnerType: unknown): boolean {
  if (role === "timan_saelger") return true;
  if (role === "partner") {
    return partnerType === "forhandler" || partnerType === "service_partner" || partnerType === "importoer";
  }
  return false;
}

export function defaultCanViewPrices(
  raw: unknown,
  portalRole: unknown,
  role?: unknown,
  partnerType?: unknown,
): boolean {
  if (raw === true) return true;
  if (raw === false) return false;
  if (typeof portalRole === "string" && PRICE_VISIBLE_PORTAL_ROLES.has(portalRole)) return true;
  if (isDealerSideLegacy(role, partnerType)) return true;
  return false;
}

export function defaultCanSubmitOrder(
  raw: unknown,
  portalRole: unknown,
  role?: unknown,
  partnerType?: unknown,
): boolean {
  if (raw === true) return true;
  if (raw === false) return false;
  if (typeof portalRole === "string" && ORDER_ALLOWED_PORTAL_ROLES.has(portalRole)) return true;
  if (isDealerSideLegacy(role, partnerType)) return true;
  return false;
}
