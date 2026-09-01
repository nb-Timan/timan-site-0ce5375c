// Phase 1B — Unified Timan Portal access model.
//
// IMPORTANT:
// This file introduces a NEW portal-level role/module-access layer
// WITHOUT touching the existing configurator role system
// (UserRole / PartnerType / RolePermissions in src/types/configurator.ts).
//
// - Internal role keys are code-safe English.
// - UI display names are Danish business names.
// - Mapping from the existing AppUser to a PortalRole keeps backward compat,
//   so pricing, configurator and order logic remain unchanged.

import { AppUser } from '@/data/appUsers';
import { Language } from '@/types/configurator';
import { canSwitchMode, getActiveRolePreview, getActiveUserView } from '@/lib/activeMode';

// ---------- Portal roles (internal English keys) ----------
export type PortalRole =
  | 'timan_backend'
  | 'timan_seller'
  | 'timan_service'
  | 'timan_importer'
  | 'timan_dealer'
  | 'timan_service_partner'
  | 'dealer_customer'
  | 'dealer_user'
  | 'private_end_user'
  | 'exhibition_user'
  | 'pending';

export const PORTAL_ROLES: PortalRole[] = [
  'timan_backend',
  'timan_seller',
  'timan_service',
  'timan_importer',
  'timan_dealer',
  'timan_service_partner',
  'dealer_customer',
  'dealer_user',
  'private_end_user',
  'exhibition_user',
  'pending',
];

// Danish business UI labels
export const PORTAL_ROLE_LABELS: Record<PortalRole, Record<Language, string>> = {
  timan_backend:         { da: 'Timan Backend',         en: 'Timan Backend',         de: 'Timan Backend',         it: 'Timan Backend',         hu: 'Timan Backend' },
  timan_seller:          { da: 'Timan Sælger',          en: 'Timan Seller',          de: 'Timan Verkäufer',       it: 'Venditore Timan',       hu: 'Timan Értékesítő' },
  timan_service:         { da: 'Timan Service',         en: 'Timan Service',         de: 'Timan Service',         it: 'Timan Service',         hu: 'Timan Service' },
  timan_importer:        { da: 'Timan Importør',        en: 'Timan Importer',        de: 'Timan Importeur',       it: 'Importatore Timan',     hu: 'Timan Importőr' },
  timan_dealer:          { da: 'Timan Forhandler',      en: 'Timan Dealer',          de: 'Timan Händler',         it: 'Rivenditore Timan',     hu: 'Timan Kereskedő' },
  timan_service_partner: { da: 'Timan Service Partner', en: 'Timan Service Partner', de: 'Timan Service-Partner', it: 'Partner di Servizio',   hu: 'Timan Szervizpartner' },
  dealer_customer:       { da: 'Forhandlerkunde',       en: 'Dealer customer',       de: 'Händlerkunde',          it: 'Cliente rivenditore',   hu: 'Kereskedői ügyfél' },
  dealer_user:           { da: 'Forhandlerbruger',      en: 'Forhandlerbruger',      de: 'Forhandlerbruger',      it: 'Forhandlerbruger',      hu: 'Forhandlerbruger' },
  private_end_user:      { da: 'Privat / Slutbruger',   en: 'Privat / Slutbruger',   de: 'Privat / Slutbruger',   it: 'Privat / Slutbruger',   hu: 'Privat / Slutbruger' },
  exhibition_user:       { da: 'Messe',                 en: 'Exhibition',           de: 'Messe',                 it: 'Fiera',                 hu: 'Kiállítás' },
  pending:               { da: 'Afventer godkendelse',  en: 'Pending approval',      de: 'Wartet auf Genehmigung',it: 'In attesa di approvazione', hu: 'Jóváhagyásra vár' },
};

// ---------- Module access keys ----------
export type ModuleAccessKey =
  | 'teknik_service'
  | 'salg_marketing'
  | 'marketing'
  | 'timan_backend'
  | 'timan_crm'
  | 'dealer_data'
  | 'claims'
  | 'tsb'
  | 'warranty'
  | 'service_information'
  | 'service_tickets'
  | 'machine_search'
  | 'messe_portal'
  | 'byg_din_timan'
  | 'tilbud'
  | 'ordre'
  | 'sales_tools'
  | 'contracts'
  | 'resources'
  | 'videos';

export type PortalAreaAccessKey =
  | 'teknik_service'
  | 'salg_marketing'
  | 'calendar'
  | 'marketing'
  | 'timan_crm'
  | 'timan_backend'
  | 'dealer_data';

export type PortalAccessUser = (
  Pick<AppUser, 'role' | 'partner_type'> & {
    email?: string | null;
    portal_role?: string | null;
    module_access?: string[] | null;
    allowed_areas?: string[] | null;
    allowed_modules?: string[] | null;
    permissions?: Record<string, boolean> | null;
    portal_variant?: string | null;
  }
);


// ---------- Default per-role module access ----------
export const DEFAULT_MODULE_ACCESS: Record<PortalRole, ModuleAccessKey[]> = {
  timan_backend: [
    'teknik_service', 'salg_marketing', 'marketing', 'timan_backend', 'timan_crm', 'dealer_data',
    'claims', 'tsb', 'warranty', 'service_information', 'service_tickets', 'machine_search',
    'messe_portal', 'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'contracts', 'resources', 'videos',
  ],
  timan_seller: [
    'teknik_service', 'salg_marketing', 'timan_crm', 'dealer_data',
    'claims', 'tsb', 'warranty', 'service_information', 'service_tickets', 'machine_search',
    'messe_portal', 'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'resources', 'videos',
  ],
  timan_service: [
    'teknik_service', 'dealer_data',
    'claims', 'tsb', 'warranty', 'service_information', 'service_tickets', 'machine_search',
    'messe_portal', 'videos',
  ],
  timan_importer: [
    'teknik_service', 'salg_marketing', 'dealer_data',
    'claims', 'warranty', 'service_information', 'service_tickets', 'machine_search',
    'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'resources', 'videos',
  ],
  timan_dealer: [
    'teknik_service', 'salg_marketing', 'dealer_data',
    'claims', 'warranty', 'service_information', 'service_tickets', 'machine_search',
    'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'resources', 'videos',
  ],
  timan_service_partner: [
    'teknik_service', 'salg_marketing', 'dealer_data',
    'claims', 'warranty', 'service_information', 'service_tickets', 'machine_search',
    'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'resources', 'videos',
  ],
  dealer_customer: [
    'salg_marketing', 'dealer_data',
    'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'resources', 'videos',
  ],
  // Read-only / visual access only.
  // Dealer User is intentionally restricted to Salg & Marketing.
  // Forhandlerdata is granted only when admins set `allowed_areas` explicitly.
  // Teknik & Service, CRM and Timan Backend are NEVER granted.
  dealer_user: [
    'messe_portal', 'salg_marketing', 'byg_din_timan', 'resources', 'sales_tools', 'videos',
  ],
  // Private / end user — same light product experience as the Messe portal.
  private_end_user: ['messe_portal'],
  // Messe — locked to the Messe layout with product/demo access only.
  exhibition_user: ['messe_portal', 'byg_din_timan', 'resources', 'videos'],
  // Awaiting admin approval — no module access until approved.
  pending: [],

};

// ---------- Action permissions per role ----------
export interface PortalPermissions {
  /** May submit orders in the portal (configurator/orders). */
  canSubmitOrder: boolean;
  /** May create/submit claims. */
  canCreateClaim: boolean;
  /** May create warranty registrations. */
  canCreateWarranty: boolean;
  /** May edit data (general write access). */
  canEditData: boolean;
  /** Has admin/backend access. */
  isBackend: boolean;
  /** May manage News CMS drafts and publishing. */
  canManageNews: boolean;
}

const READ_ONLY: PortalPermissions = {
  canSubmitOrder: false,
  canCreateClaim: false,
  canCreateWarranty: false,
  canEditData: false,
  isBackend: false,
  canManageNews: false,
};

const FULL: PortalPermissions = {
  canSubmitOrder: true,
  canCreateClaim: true,
  canCreateWarranty: true,
  canEditData: true,
  isBackend: false,
  canManageNews: false,
};

export function getPortalPermissions(role: PortalRole): PortalPermissions {
  switch (role) {
    // Internal/admin roles: can manage/view claims but CANNOT create new ones
    // (mirrors the old Service Portal where Timan Admin could not create claims).
    case 'timan_backend':         return { ...FULL, canCreateClaim: false, isBackend: true, canManageNews: true };
    case 'timan_seller':          return { ...FULL, canCreateClaim: false };
    case 'timan_service':         return { ...FULL, canCreateClaim: false, canSubmitOrder: false };
    // Dealer-side roles: can create claims
    case 'timan_importer':        return FULL;
    case 'timan_dealer':          return FULL;
    case 'timan_service_partner': return FULL;
    case 'dealer_customer':       return READ_ONLY;
    // Read-only
    case 'dealer_user':           return READ_ONLY;
    case 'private_end_user':      return READ_ONLY;
    // Public exhibition demo — no writes, no orders, no claims.
    case 'exhibition_user':       return READ_ONLY;
    default:                      return READ_ONLY;
  }
}

export function canManageNewsContent(
  user: ({ permissions?: Record<string, boolean> | null; portal_role?: string | null; module_access?: string[] | null; allowed_areas?: string[] | null } & Pick<AppUser, 'role' | 'partner_type'>) | null | undefined,
): boolean {
  if (!user) return false;
  const role = derivePortalRole(user);
  if (role && getPortalPermissions(role).canManageNews) return true;
  if (Array.isArray(user.allowed_areas)) return user.allowed_areas.includes('marketing');
  return user.permissions?.news_manage === true;
}

/** True when the active portal session is the public Messe demo. */
export function isExhibitionRole(role: PortalRole | null | undefined): boolean {
  return role === 'exhibition_user';
}

/**
 * Phase 59 — Messe Portal users are real authenticated users
 * (typically dealer_user) whose app_users.portal_variant is set to 'messe'.
 * They are locked to the /messe layout and blocked from CRM/Backend/etc.
 */
export function isMesseVariantUser(
  user: { portal_variant?: string | null } | null | undefined,
): boolean {
  return (user?.portal_variant || '').toLowerCase() === 'messe';
}

export function hasInternalMesseAccess(
  user: (
    Pick<AppUser, 'role' | 'partner_type'> & {
      email?: string | null;
      portal_role?: string | null;
      module_access?: string[] | null;
      allowed_modules?: string[] | null;
      allowed_areas?: string[] | null;
      portal_variant?: string | null;
    }
  ) | null | undefined,
): boolean {
  if (!user || isMesseVariantUser(user)) return false;
  const role = derivePortalRole(user);
  const moduleOverride = getUserModuleAccessOverride(user);
  if (Array.isArray(moduleOverride)) {
    return hasModuleAccess(role, 'messe_portal', moduleOverride);
  }
  if (role === 'timan_backend' || role === 'timan_seller' || role === 'timan_service') return true;
  const externalRoles: PortalRole[] = ['timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user', 'exhibition_user'];
  if (role && externalRoles.includes(role)) return false;
  return user.role !== 'partner' && Array.isArray(user.allowed_areas) && user.allowed_areas.includes('salg_marketing');
}

export function hasMessePortalAccess(
  user: (
    Pick<AppUser, 'role' | 'partner_type'> & {
      email?: string | null;
      portal_role?: string | null;
      module_access?: string[] | null;
      allowed_modules?: string[] | null;
      portal_variant?: string | null;
    }
  ) | null | undefined,
): boolean {
  if (!user) return false;
  if (isMesseVariantUser(user)) return true;
  const role = derivePortalRole(user);
  if (role === 'exhibition_user') return true;
  const moduleOverride = getUserModuleAccessOverride(user);
  return hasModuleAccess(role, 'messe_portal', moduleOverride);
}

// ---------- Claims view variant ----------
// Internal/admin view: Timan Backend, Timan Service, Timan Sælger
// Dealer-side view:    Timan Importør, Timan Forhandler, Timan Service Partner, Dealer User (read-only)
export type ClaimsViewVariant = 'internal' | 'dealer' | 'none';

export function getClaimsViewVariant(role: PortalRole | null): ClaimsViewVariant {
  if (!role) return 'none';
  switch (role) {
    case 'timan_backend':
    case 'timan_service':
    case 'timan_seller':
      return 'internal';
    case 'timan_importer':
    case 'timan_dealer':
    case 'timan_service_partner':
    case 'dealer_customer':
    case 'dealer_user':
      return 'dealer';
    default:
      return 'none';
  }
}

// ---------- Warranty view variant ----------
// Admin view: Timan Backend, Timan Service, Timan Sælger
// Dealer view: Timan Importør, Timan Forhandler, Timan Service Partner, Dealer User (read-only)
export type WarrantyViewVariant = 'admin' | 'dealer' | 'none';

export function getWarrantyViewVariant(role: PortalRole | null): WarrantyViewVariant {
  if (!role) return 'none';
  switch (role) {
    case 'timan_backend':
    case 'timan_service':
    case 'timan_seller':
      return 'admin';
    case 'timan_importer':
    case 'timan_dealer':
    case 'timan_service_partner':
    case 'dealer_customer':
    case 'dealer_user':
      return 'dealer';
    default:
      return 'none';
  }
}

// ---------- Mapping from existing AppUser → PortalRole ----------
// Keeps backward compat with current UserRole/PartnerType so we don't break
// configurator, pricing or auth.
export function deriveStoredPortalRole(user: (Pick<AppUser, 'role' | 'partner_type'> & { portal_role?: string | null; module_access?: string[] | null }) | null): PortalRole | null {
  if (!user) return null;
  if (user.portal_role && (PORTAL_ROLES as string[]).includes(user.portal_role)) {
    return user.portal_role as PortalRole;
  }
  if (user.role === 'timan_saelger') return 'timan_seller';
  if (user.role === 'partner') {
    switch (user.partner_type) {
      case 'forhandler':      return 'timan_dealer';
      case 'service_partner': return user.module_access?.includes('tsb') ? 'timan_service' : 'timan_service_partner';
      case 'importoer':       return 'timan_importer';
      default:                return 'dealer_user';
    }
  }
  return null;
}

export function derivePortalRole(user: (Pick<AppUser, 'role' | 'partner_type'> & { email?: string | null; portal_role?: string | null; module_access?: string[] | null }) | null): PortalRole | null {
  const baseRole = deriveStoredPortalRole(user);
  // Active-mode override: any backend user can choose to view the portal
  // as one of the predefined concrete users (BP / JTN / EM / AKR / NB / DVP).
  // The DB role is unchanged — this only controls navigation, area
  // visibility, claims/warranty view variant and CRM scoping. Backend
  // pages remain reachable by switching back to Backend mode.
  if (baseRole === 'timan_backend' && canSwitchMode(user)) {
    const rolePreview = getActiveRolePreview(user.email);
    if (rolePreview) return rolePreview.key as PortalRole;
    const userView = getActiveUserView(user.email);
    if (userView) return userView.portalRole as PortalRole;
  }
  return baseRole;
}

export function isBackendActor(user: (Pick<AppUser, 'role' | 'partner_type'> & { portal_role?: string | null; module_access?: string[] | null }) | null | undefined): boolean {
  return deriveStoredPortalRole(user ?? null) === 'timan_backend';
}

// ---------- Helpers ----------
export function hasModuleAccess(
  role: PortalRole | null,
  key: ModuleAccessKey,
  override?: ModuleAccessKey[] | null,
): boolean {
  if (!role) return false;
  if (role === 'timan_backend') return true;
  const list = Array.isArray(override) ? override : DEFAULT_MODULE_ACCESS[role];
  return list.includes(key);
}

export function getUserModuleAccessOverride(
  user: Pick<PortalAccessUser, 'allowed_modules' | 'module_access'> | null | undefined,
): ModuleAccessKey[] | null {
  if (!user) return null;
  if (Array.isArray(user.allowed_modules)) return user.allowed_modules as ModuleAccessKey[];
  if (Array.isArray(user.module_access)) return user.module_access as ModuleAccessKey[];
  return null;
}

export function hasAreaAccess(
  user: PortalAccessUser | null | undefined,
  area: PortalAreaAccessKey,
): boolean {
  if (!user) return false;
  const role = derivePortalRole(user);

  // Timan Backend is super-admin. Role defaults are the minimum access, so
  // manual user settings must never hide an area that Backend can manage.
  if (role === 'timan_backend') return true;

  // Highest priority: manual Backend → Brugere area choices.
  // Empty array means "no areas"; null/undefined means "use role defaults".
  if (Array.isArray(user.allowed_areas)) {
    return user.allowed_areas.includes(area);
  }

  if (user.role === 'slutkunde' && !role) return false;

  if (area === 'marketing') {
    return canManageNewsContent(user);
  }

  if (area === 'calendar') {
    const moduleOverride = getUserModuleAccessOverride(user);
    return hasModuleAccess(role, 'timan_crm', moduleOverride);
  }

  const moduleOverride = getUserModuleAccessOverride(user);

  if (area === 'dealer_data') {
    if (!role) return false;
    if (hasModuleAccess(role, 'dealer_data', moduleOverride)) return true;
    return (
      role === 'timan_backend' ||
      role === 'timan_seller' ||
      role === 'timan_service' ||
      role === 'timan_importer' ||
      role === 'timan_dealer' ||
      role === 'timan_service_partner' ||
      role === 'dealer_customer'
    );
  }

  return hasModuleAccess(role, area as ModuleAccessKey, moduleOverride);
}
