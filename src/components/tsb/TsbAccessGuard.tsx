/**
 * Role + permission based access guard for the TSB module.
 *
 * Two distinct gates:
 *  - canAccessTsb(user): may VIEW the TSB module. Controlled by
 *    `module_access` override (or role default) including 'tsb'.
 *    Dealer / service partner / importer users with TSB module access
 *    can read the portal, even if they cannot create.
 *  - canCreateTsb(user): may CREATE new TSBs. Internal roles
 *    (timan_backend, timan_service, timan_seller) default to true.
 *    External roles require explicit `permissions.can_create_tsb === true`.
 */

import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAppUser } from "@/context/AppUserContext";
import {
  derivePortalRole,
  getUserModuleAccessOverride,
  hasModuleAccess,
  PortalRole,
} from "@/lib/portalAccess";
import type { ModuleAccessKey } from "@/lib/portalAccess";
import type { AppUser } from "@/data/appUsers";

type UserLike =
  | (Pick<AppUser, "role" | "partner_type"> & {
      module_access?: string[] | null;
      allowed_modules?: string[] | null;
      permissions?: Record<string, boolean> | null;
      portal_role?: string | null;
      email?: string | null;
    })
  | null;

const TSB_INTERNAL_ROLES: PortalRole[] = ["timan_backend", "timan_service", "timan_seller"];

function moduleOverride(user: UserLike): ModuleAccessKey[] | null {
  return getUserModuleAccessOverride(user);
}

export function canAccessTsb(
  roleOrUser: PortalRole | UserLike,
  user?: UserLike,
): boolean {
  // Backwards-compatible: callers pass either (role) or (role, user) or (user).
  let role: PortalRole | null;
  let u: UserLike;
  if (typeof roleOrUser === "string" || roleOrUser === null) {
    role = roleOrUser as PortalRole | null;
    u = user ?? null;
  } else {
    u = roleOrUser;
    role = derivePortalRole(u);
  }
  if (!role) return false;
  return hasModuleAccess(role, "tsb", moduleOverride(u));
}

export function canCreateTsb(
  roleOrUser: PortalRole | UserLike,
  user?: UserLike,
): boolean {
  let role: PortalRole | null;
  let u: UserLike;
  if (typeof roleOrUser === "string" || roleOrUser === null) {
    role = roleOrUser as PortalRole | null;
    u = user ?? null;
  } else {
    u = roleOrUser;
    role = derivePortalRole(u);
  }
  if (!canAccessTsb(role, u)) return false;
  const explicit = u?.permissions?.can_create_tsb;
  if (explicit === true) return true;
  if (explicit === false) return false;
  // No explicit permission → internal roles default to true, others false.
  return !!role && TSB_INTERNAL_ROLES.includes(role);
}

export default function TsbAccessGuard({
  children,
  requireCreate = false,
}: {
  children: ReactNode;
  requireCreate?: boolean;
}) {
  const { appUser, loading } = useAppUser();
  if (loading) return null;
  const role = derivePortalRole(appUser ?? null);
  if (!canAccessTsb(role, appUser ?? null)) {
    return <Navigate to="/portal" replace />;
  }
  if (requireCreate && !canCreateTsb(role, appUser ?? null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Adgang nægtet</h1>
          <p className="text-sm text-slate-600 mb-6">Du har ikke adgang til at oprette TSB.</p>
          <Navigate to="/portal/service/tsb" replace />
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
