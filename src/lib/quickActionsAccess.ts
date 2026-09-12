import { DEFAULT_QUICK_ACTIONS, QUICK_ACTION_KEYS, type QuickActionKey } from "@/lib/backend-users-store";
import {
  derivePortalRole,
  getUserModuleAccessOverride,
  hasAreaAccess,
  hasModuleAccess,
  type PortalAccessUser,
  type PortalRole,
  PORTAL_ROLES,
} from "@/lib/portalAccess";

type QuickActionAccessUser = PortalAccessUser & {
  quick_actions?: string[] | null;
};

function configuredQuickActions(
  user: QuickActionAccessUser,
  role: PortalRole | null,
): QuickActionKey[] {
  // Dealer quick actions are a canonical role flow: lead, invoice acceptance,
  // and warranty registration. Ignore legacy per-user demo selections here.
  if (role === "timan_dealer") {
    return DEFAULT_QUICK_ACTIONS.timan_dealer;
  }

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
    case "warranty_registrations":
      return hasModuleAccess(role, "warranty", moduleOverride);
    default:
      return false;
  }
}

export function resolveEffectiveQuickActions(user: QuickActionAccessUser | null | undefined): QuickActionKey[] {
  if (!user) return [];
  const role = derivePortalRole(user);
  return configuredQuickActions(user, role).filter((key) => canOpenQuickAction(user, key));
}

/** Backend overview only. It derives default roles through the same resolver
 * that filters every role's visible quick actions. */
export function getDefaultQuickActionRoles(key: QuickActionKey): PortalRole[] {
  return PORTAL_ROLES.filter((portalRole) => {
    const defaultUser: QuickActionAccessUser = {
      role: "partner",
      partner_type: null,
      portal_role: portalRole,
      module_access: null,
      allowed_areas: null,
      allowed_modules: null,
      quick_actions: DEFAULT_QUICK_ACTIONS[portalRole],
    };

    return resolveEffectiveQuickActions(defaultUser).includes(key);
  });
}
