import { DEFAULT_QUICK_ACTIONS, QUICK_ACTION_KEYS, type QuickActionKey } from "@/lib/backend-users-store";
import {
  derivePortalRole,
  getUserModuleAccessOverride,
  hasAreaAccess,
  hasModuleAccess,
  type PortalAccessUser,
  type PortalRole,
} from "@/lib/portalAccess";

type QuickActionAccessUser = PortalAccessUser & {
  quick_actions?: string[] | null;
};

function configuredQuickActions(
  user: QuickActionAccessUser,
  role: PortalRole | null,
): QuickActionKey[] {
  const raw = user.quick_actions ?? null;
  const hasLegacyQuickActions = Array.isArray(raw)
    && raw.some((key) => key === "calendar" || key === "my_dealers");

  if (Array.isArray(raw) && !hasLegacyQuickActions) {
    return raw.filter((key): key is QuickActionKey => (QUICK_ACTION_KEYS as readonly string[]).includes(key));
  }

  return role ? (DEFAULT_QUICK_ACTIONS[role] ?? []) : [];
}

function canOpenQuickAction(user: QuickActionAccessUser, key: QuickActionKey): boolean {
  const role = derivePortalRole(user);
  const moduleOverride = getUserModuleAccessOverride(user);

  switch (key) {
    case "create_lead":
    case "create_demo":
      return hasAreaAccess(user, "timan_crm");
    case "company_contact_info":
    case "dealer_invoice_accept":
    case "partner_map":
      return hasModuleAccess(role, "sales_tools", moduleOverride);
    default:
      return false;
  }
}

export function resolveEffectiveQuickActions(user: QuickActionAccessUser | null | undefined): QuickActionKey[] {
  if (!user) return [];
  const role = derivePortalRole(user);
  return configuredQuickActions(user, role).filter((key) => canOpenQuickAction(user, key));
}
