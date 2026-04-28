/**
 * Role-based access guard for the TSB module.
 *
 * In the old Timan TSB Hub, TSB was an internal/admin-only module.
 * We map that 1:1 to the unified Timan Portal:
 *  - Internal (full access): timan_backend, timan_service, timan_seller
 *  - Dealer-side / dealer_user: NO access
 *
 * Renders the page only if the current user has TSB access; otherwise
 * redirects back to /portal.
 */

import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAppUser } from "@/context/AppUserContext";
import { derivePortalRole, hasModuleAccess, PortalRole } from "@/lib/portalAccess";

const TSB_INTERNAL_ROLES: PortalRole[] = ["timan_backend", "timan_service", "timan_seller"];

export function canAccessTsb(role: PortalRole | null): boolean {
  if (!role) return false;
  return TSB_INTERNAL_ROLES.includes(role) && hasModuleAccess(role, "tsb");
}

/**
 * Only Timan Backend may create new TSB'er.
 * Timan Service and Timan Sælger have full internal view access but cannot
 * create new TSB'er (mirrors the old TSB Hub admin permission split).
 */
export function canCreateTsb(role: PortalRole | null): boolean {
  return role === "timan_backend";
}

export default function TsbAccessGuard({ children }: { children: ReactNode }) {
  const { appUser, loading } = useAppUser();
  if (loading) return null;
  const role = derivePortalRole(appUser ?? null);
  if (!canAccessTsb(role)) {
    return <Navigate to="/portal" replace />;
  }
  return <>{children}</>;
}
