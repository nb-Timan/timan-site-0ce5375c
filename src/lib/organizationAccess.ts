import type { PortalRole } from "@/lib/portalAccess";

export type OrganizationAccessRole = "collaboration_manager";

const EXTERNAL_ORGANIZATION_ROLES = new Set<PortalRole>([
  "timan_dealer",
  "timan_importer",
  "timan_service_partner",
  "dealer_customer",
  "dealer_user",
]);

export function normalizeOrganizationAccessRole(
  value: string | null | undefined,
): OrganizationAccessRole | null {
  return value === "collaboration_manager" ? value : null;
}

export function hasCollaborationManagerAccess(
  user: { organization_access_role?: string | null } | null | undefined,
  role?: PortalRole | null,
): boolean {
  if (user?.organization_access_role !== "collaboration_manager") return false;
  return role ? EXTERNAL_ORGANIZATION_ROLES.has(role) : true;
}
