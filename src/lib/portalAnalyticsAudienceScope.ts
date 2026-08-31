import {
  normalizePartnerAccountType,
  type PartnerAccountTypeId,
} from "@/lib/partnerAccountTypes";

export type AnalyticsAudienceKey = "portal" | "partners" | "timan_sellers" | "timan" | "my_backend";
export type AnalyticsPartnerTypeFilter = "all" | "dealer" | "importer" | "service_partner";

export interface AnalyticsAudienceUser {
  user_id: string | null;
  email: string;
  display_name: string | null;
  portal_role: string | null;
  dealer_number: string | null;
  partner_type?: string | null;
  partner_account_type?: PartnerAccountTypeId | string | null;
  dealer_customer_type?: string | null;
  dealer_customer_type_label?: string | null;
  dealer_type?: string | null;
}

export interface ResolvedAnalyticsAudienceScope {
  baseUsers: AnalyticsAudienceUser[];
  availableUsers: AnalyticsAudienceUser[];
  effectiveUsers: AnalyticsAudienceUser[];
  effectiveUserKeys: string[];
  availableRoles: string[];
  summary: string;
}

const INTERNAL_TIMAN_ROLES = new Set([
  "timan_backend",
  "timan_seller",
  "timan_service",
  "exhibition_user",
]);

const PARTNER_ROLES = new Set([
  "timan_dealer",
  "timan_importer",
  "timan_service_partner",
  "dealer_customer",
  "dealer_user",
]);

const SELLER_ROLES = new Set(["timan_seller"]);
const ANALYSABLE_ROLES = new Set([...INTERNAL_TIMAN_ROLES, ...PARTNER_ROLES]);

export function analyticsUserKey(user: { user_id?: string | null; email?: string | null }): string {
  return String(user.user_id || user.email || "").trim().toLowerCase();
}

export function isInternalTimanAnalyticsUser(user: AnalyticsAudienceUser): boolean {
  return INTERNAL_TIMAN_ROLES.has(String(user.portal_role || ""));
}

export function isTimanSellerAnalyticsUser(user: AnalyticsAudienceUser): boolean {
  return SELLER_ROLES.has(String(user.portal_role || ""));
}

export function isPartnerAnalyticsUser(user: AnalyticsAudienceUser): boolean {
  return PARTNER_ROLES.has(String(user.portal_role || ""));
}

export function resolveAnalyticsPartnerAccountType(user: AnalyticsAudienceUser): PartnerAccountTypeId | null {
  return normalizePartnerAccountType(user.partner_account_type)
    ?? normalizePartnerAccountType(user.partner_type)
    ?? normalizePartnerAccountType(user.dealer_customer_type_label)
    ?? normalizePartnerAccountType(user.dealer_customer_type)
    ?? normalizePartnerAccountType(user.dealer_type)
    ?? roleFallbackPartnerType(user.portal_role);
}

function roleFallbackPartnerType(role: string | null | undefined): PartnerAccountTypeId | null {
  if (role === "timan_dealer" || role === "dealer_user") return "dealer";
  if (role === "timan_importer") return "importer";
  if (role === "timan_service_partner") return "service_partner";
  if (role === "dealer_customer") return "dealer_customer";
  return null;
}

function uniqueUsers(users: AnalyticsAudienceUser[]): AnalyticsAudienceUser[] {
  const seen = new Set<string>();
  const out: AnalyticsAudienceUser[] = [];
  users.forEach((user) => {
    const key = analyticsUserKey(user);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(user);
  });
  return out;
}

function sortUsers(users: AnalyticsAudienceUser[]): AnalyticsAudienceUser[] {
  return [...users].sort((a, b) => {
    const nameA = (a.display_name || a.email || "").toLocaleLowerCase("da-DK");
    const nameB = (b.display_name || b.email || "").toLocaleLowerCase("da-DK");
    return nameA.localeCompare(nameB, "da-DK");
  });
}

function pluralizeUsers(count: number): string {
  return count === 1 ? "1 bruger" : `${count} brugere`;
}

export function resolveAnalyticsAudienceScope({
  users,
  audience,
  partnerType = "all",
  currentBackendUserKey,
  selectedRoles = [],
  selectedUserKeys = [],
}: {
  users: AnalyticsAudienceUser[];
  audience: AnalyticsAudienceKey;
  partnerType?: AnalyticsPartnerTypeFilter;
  currentBackendUserKey?: string | null;
  selectedRoles?: string[];
  selectedUserKeys?: string[];
}): ResolvedAnalyticsAudienceScope {
  const normalSelectedRoles = new Set(selectedRoles.map((role) => role.trim()).filter(Boolean));
  const normalSelectedUserKeys = new Set(selectedUserKeys.map((key) => key.trim().toLowerCase()).filter(Boolean));
  const backendKey = (currentBackendUserKey || "").trim().toLowerCase();
  const analysableUsers = uniqueUsers(users).filter((user) => ANALYSABLE_ROLES.has(String(user.portal_role || "")));

  let baseUsers = analysableUsers;
  if (audience === "partners") {
    baseUsers = analysableUsers.filter((user) => {
      if (!isPartnerAnalyticsUser(user)) return false;
      const resolvedType = resolveAnalyticsPartnerAccountType(user);
      return partnerType === "all" || resolvedType === partnerType;
    });
  } else if (audience === "timan_sellers") {
    baseUsers = analysableUsers.filter(isTimanSellerAnalyticsUser);
  } else if (audience === "timan") {
    baseUsers = analysableUsers.filter(isInternalTimanAnalyticsUser);
  } else if (audience === "my_backend") {
    baseUsers = analysableUsers.filter((user) => {
      const key = analyticsUserKey(user);
      return key === backendKey && user.portal_role === "timan_backend";
    });
  }

  baseUsers = sortUsers(baseUsers);
  const roleFilteredUsers = normalSelectedRoles.size
    ? baseUsers.filter((user) => user.portal_role && normalSelectedRoles.has(user.portal_role))
    : baseUsers;
  const availableUsers = sortUsers(roleFilteredUsers);
  const effectiveUsers = normalSelectedUserKeys.size
    ? availableUsers.filter((user) => normalSelectedUserKeys.has(analyticsUserKey(user)))
    : availableUsers;
  const availableRoles = Array.from(new Set(baseUsers.map((user) => user.portal_role).filter(Boolean) as string[])).sort();
  const summary = [
    pluralizeUsers(effectiveUsers.length),
    normalSelectedRoles.size ? `${normalSelectedRoles.size} rolle${normalSelectedRoles.size === 1 ? "" : "r"} valgt` : null,
    normalSelectedUserKeys.size ? `${normalSelectedUserKeys.size} valgt manuelt` : null,
  ].filter(Boolean).join(" · ");

  return {
    baseUsers,
    availableUsers,
    effectiveUsers,
    effectiveUserKeys: effectiveUsers.map(analyticsUserKey).filter(Boolean),
    availableRoles,
    summary,
  };
}
