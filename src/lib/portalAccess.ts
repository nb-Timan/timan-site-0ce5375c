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

// ---------- Portal roles (internal English keys) ----------
export type PortalRole =
  | 'timan_backend'
  | 'timan_seller'
  | 'timan_service'
  | 'timan_importer'
  | 'timan_dealer'
  | 'timan_service_partner'
  | 'dealer_user';

export const PORTAL_ROLES: PortalRole[] = [
  'timan_backend',
  'timan_seller',
  'timan_service',
  'timan_importer',
  'timan_dealer',
  'timan_service_partner',
  'dealer_user',
];

// Danish business UI labels
export const PORTAL_ROLE_LABELS: Record<PortalRole, Record<Language, string>> = {
  timan_backend:         { da: 'Timan Backend',         en: 'Timan Backend',         de: 'Timan Backend',         it: 'Timan Backend',         hu: 'Timan Backend' },
  timan_seller:          { da: 'Timan Sælger',          en: 'Timan Seller',          de: 'Timan Verkäufer',       it: 'Venditore Timan',       hu: 'Timan Értékesítő' },
  timan_service:         { da: 'Timan Service',         en: 'Timan Service',         de: 'Timan Service',         it: 'Timan Service',         hu: 'Timan Service' },
  timan_importer:        { da: 'Timan Importør',        en: 'Timan Importer',        de: 'Timan Importeur',       it: 'Importatore Timan',     hu: 'Timan Importőr' },
  timan_dealer:          { da: 'Timan Forhandler',      en: 'Timan Dealer',          de: 'Timan Händler',         it: 'Rivenditore Timan',     hu: 'Timan Kereskedő' },
  timan_service_partner: { da: 'Timan Service Partner', en: 'Timan Service Partner', de: 'Timan Service-Partner', it: 'Partner di Servizio',   hu: 'Timan Szervizpartner' },
  dealer_user:           { da: 'Dealer User',           en: 'Dealer User',           de: 'Händler-Nutzer',        it: 'Utente Rivenditore',    hu: 'Kereskedői Felhasználó' },
};

// ---------- Module access keys ----------
export type ModuleAccessKey =
  | 'teknik_service'
  | 'salg_marketing'
  | 'timan_backend'
  | 'claims'
  | 'tsb'
  | 'warranty'
  | 'service_information'
  | 'byg_din_timan'
  | 'tilbud'
  | 'ordre'
  | 'sales_tools'
  | 'resources';

// ---------- Default per-role module access ----------
export const DEFAULT_MODULE_ACCESS: Record<PortalRole, ModuleAccessKey[]> = {
  timan_backend: [
    'teknik_service', 'salg_marketing', 'timan_backend',
    'claims', 'tsb', 'warranty', 'service_information',
    'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'resources',
  ],
  timan_seller: [
    'teknik_service', 'salg_marketing',
    'claims', 'tsb', 'warranty', 'service_information',
    'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'resources',
  ],
  timan_service: [
    'teknik_service',
    'claims', 'tsb', 'warranty', 'service_information',
  ],
  timan_importer: [
    'teknik_service', 'salg_marketing',
    'claims', 'tsb', 'warranty', 'service_information',
    'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'resources',
  ],
  timan_dealer: [
    'teknik_service', 'salg_marketing',
    'claims', 'tsb', 'warranty', 'service_information',
    'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'resources',
  ],
  timan_service_partner: [
    'teknik_service', 'salg_marketing',
    'claims', 'tsb', 'warranty', 'service_information',
    'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'resources',
  ],
  // Read-only / visual access only
  dealer_user: [
    'teknik_service', 'salg_marketing',
    'service_information', 'byg_din_timan', 'resources', 'sales_tools',
  ],
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
}

const READ_ONLY: PortalPermissions = {
  canSubmitOrder: false,
  canCreateClaim: false,
  canCreateWarranty: false,
  canEditData: false,
  isBackend: false,
};

const FULL: PortalPermissions = {
  canSubmitOrder: true,
  canCreateClaim: true,
  canCreateWarranty: true,
  canEditData: true,
  isBackend: false,
};

export function getPortalPermissions(role: PortalRole): PortalPermissions {
  switch (role) {
    case 'timan_backend':         return { ...FULL, isBackend: true };
    case 'timan_seller':          return FULL;
    case 'timan_service':         return { ...FULL, canSubmitOrder: false };
    case 'timan_importer':        return FULL;
    case 'timan_dealer':          return FULL;
    case 'timan_service_partner': return FULL;
    case 'dealer_user':           return READ_ONLY;
    default:                      return READ_ONLY;
  }
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

// ---------- Mapping from existing AppUser → PortalRole ----------
// Keeps backward compat with current UserRole/PartnerType so we don't break
// configurator, pricing or auth.
export function derivePortalRole(user: Pick<AppUser, 'role' | 'partner_type'> | null): PortalRole | null {
  if (!user) return null;
  if (user.role === 'timan_saelger') return 'timan_seller';
  if (user.role === 'partner') {
    switch (user.partner_type) {
      case 'forhandler':      return 'timan_dealer';
      case 'service_partner': return 'timan_service_partner';
      case 'importoer':       return 'timan_importer';
      default:                return 'dealer_user';
    }
  }
  // slutkunde and unknowns → no portal role
  return null;
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
