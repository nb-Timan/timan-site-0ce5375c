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
import { canSwitchMode, getActiveSellerView, getActiveRolePreview } from '@/lib/activeMode';

// ---------- Portal roles (internal English keys) ----------
export type PortalRole =
  | 'timan_backend'
  | 'timan_seller'
  | 'timan_service'
  | 'timan_importer'
  | 'timan_dealer'
  | 'timan_service_partner'
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
  dealer_user:           { da: 'Forhandlerbruger',      en: 'Forhandlerbruger',      de: 'Forhandlerbruger',      it: 'Forhandlerbruger',      hu: 'Forhandlerbruger' },
  private_end_user:      { da: 'Privat / Slutbruger',   en: 'Privat / Slutbruger',   de: 'Privat / Slutbruger',   it: 'Privat / Slutbruger',   hu: 'Privat / Slutbruger' },
  exhibition_user:       { da: 'Timan Messe',           en: 'Timan Exhibition',      de: 'Timan Messe',           it: 'Timan Fiera',           hu: 'Timan Kiállítás' },
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
  | 'byg_din_timan'
  | 'tilbud'
  | 'ordre'
  | 'sales_tools'
  | 'contracts'
  | 'resources'
  | 'videos';


// ---------- Default per-role module access ----------
export const DEFAULT_MODULE_ACCESS: Record<PortalRole, ModuleAccessKey[]> = {
  timan_backend: [
    'teknik_service', 'salg_marketing', 'marketing', 'timan_backend', 'timan_crm', 'dealer_data',
    'claims', 'tsb', 'warranty', 'service_information', 'service_tickets', 'machine_search',
    'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'contracts', 'resources', 'videos',
  ],
  timan_seller: [
    'teknik_service', 'salg_marketing', 'timan_crm', 'dealer_data',
    'claims', 'tsb', 'warranty', 'service_information', 'service_tickets', 'machine_search',
    'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'resources', 'videos',
  ],
  timan_service: [
    'teknik_service', 'dealer_data',
    'claims', 'tsb', 'warranty', 'service_information', 'service_tickets', 'machine_search',
    'videos',
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
  // Read-only / visual access only.
  // Dealer User is intentionally restricted to Salg & Marketing.
  // Forhandlerdata is granted only when admins set `allowed_areas` explicitly.
  // Teknik & Service, Timan CRM and Timan Backend are NEVER granted.
  dealer_user: [
    'salg_marketing', 'byg_din_timan', 'resources', 'sales_tools', 'videos',
  ],
  // Private / end user — no portal modules by default.
  private_end_user: [],
  // Public exhibition / fair demo session — NO portal modules.
  // The /messe pages are public and bypass module_access entirely.
  exhibition_user: [],
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
    // Read-only
    case 'dealer_user':           return READ_ONLY;
    case 'private_end_user':      return READ_ONLY;
    // Public exhibition demo — no writes, no orders, no claims.
    case 'exhibition_user':       return READ_ONLY;
    default:                      return READ_ONLY;
  }
}

export function canManageNewsContent(
  user: ({ permissions?: Record<string, boolean> | null; portal_role?: string | null; module_access?: string[] | null } & Pick<AppUser, 'role' | 'partner_type'>) | null | undefined,
): boolean {
  if (!user) return false;
  const role = derivePortalRole(user);
  if (role && getPortalPermissions(role).canManageNews) return true;
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
      allowed_areas?: string[] | null;
      portal_variant?: string | null;
    }
  ) | null | undefined,
): boolean {
  if (!user || isMesseVariantUser(user)) return false;
  const role = derivePortalRole(user);
  if (role === 'timan_backend' || role === 'timan_seller' || role === 'timan_service') return true;
  const externalRoles: PortalRole[] = ['timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_user', 'exhibition_user'];
  if (role && externalRoles.includes(role)) return false;
  return user.role !== 'partner' && Array.isArray(user.allowed_areas) && user.allowed_areas.includes('salg_marketing');
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
    case 'dealer_user':
      return 'dealer';
    default:
      return 'none';
  }
}

// ---------- Mapping from existing AppUser → PortalRole ----------
// Keeps backward compat with current UserRole/PartnerType so we don't break
// configurator, pricing or auth.
export function derivePortalRole(user: (Pick<AppUser, 'role' | 'partner_type'> & { email?: string | null; portal_role?: string | null; module_access?: string[] | null }) | null): PortalRole | null {
  if (!user) return null;
  const baseRole: PortalRole | null = (() => {
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
  })();

  // Active-mode override: any backend user can choose to view the portal
  // as one of the predefined Timan sellers (BP / JTN / EM / AKR / NB).
  // The DB role is unchanged — this only controls navigation, area
  // visibility, claims/warranty view variant and CRM scoping. Backend
  // pages remain reachable by switching back to Backend mode.
  if (baseRole === 'timan_backend' && canSwitchMode(user)) {
    const rolePreview = getActiveRolePreview(user.email);
    if (rolePreview) return rolePreview.key as PortalRole;
    if (getActiveSellerView(user.email)) return 'timan_seller';
  }
  return baseRole;
}

// ---------- Helpers ----------
export function hasModuleAccess(
  role: PortalRole | null,
  key: ModuleAccessKey,
  override?: ModuleAccessKey[] | null,
): boolean {
  if (!role) return false;
  const list = override && override.length > 0 ? override : DEFAULT_MODULE_ACCESS[role];
  return list.includes(key);
}
