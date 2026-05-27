// Phase 1: Portal area grouping for "Velkommen til Timan Portalen".
// Existing modules from portalModules.ts are grouped under "Salg & Marketing".
// Teknik & Service and Timan Backend are placeholders for now (modules imported in later phases).
// IMPORTANT: This file does NOT change pricing, configurator, auth or order logic.

import { AppUser } from '@/data/appUsers';
import { Language } from '@/types/configurator';
import { PortalModuleId } from '@/lib/portalModules';
import { derivePortalRole, hasModuleAccess, ModuleAccessKey } from '@/lib/portalAccess';

export type PortalAreaId = 'teknik_service' | 'salg_marketing' | 'timan_crm' | 'timan_backend';

export interface PortalArea {
  id: PortalAreaId;
  title: Record<Language, string>;
  description: Record<Language, string>;
  /** Existing module IDs that belong to this area (rendered via ModuleCard). */
  moduleIds: PortalModuleId[];
  /** Placeholder cards (Phase 1) — shown as "Kommer snart" until real modules land. */
  placeholders: { key: string; title: Record<Language, string> }[];
}

export const PORTAL_AREAS: PortalArea[] = [
  {
    id: 'teknik_service',
    title: { da: 'Teknik & Service', en: 'Technical & Service', de: 'Technik & Service', it: 'Tecnico & Assistenza', hu: 'Műszaki & Szerviz' },
    description: {
      da: 'Service, garanti, TSB og teknisk information.',
      en: 'Service, warranty, TSB and technical information.',
      de: 'Service, Garantie, TSB und technische Informationen.',
      it: 'Assistenza, garanzia, TSB e informazioni tecniche.',
      hu: 'Szerviz, garancia, TSB és műszaki információk.',
    },
    moduleIds: ['claims'],
    placeholders: [
      { key: 'tsb_portal',      title: { da: 'TSB Portal', en: 'TSB Portal', de: 'TSB Portal', it: 'Portale TSB', hu: 'TSB Portál' } },
      { key: 'warranty_reg',    title: { da: 'Garantiregistrering', en: 'Warranty registration', de: 'Garantieregistrierung', it: 'Registrazione garanzia', hu: 'Garanciaregisztráció' } },
      { key: 'service_info',    title: { da: 'Serviceinformation', en: 'Service information', de: 'Serviceinformationen', it: 'Informazioni di assistenza', hu: 'Szervizinformáció' } },
      { key: 'service_maintenance', title: { da: 'Service registrering og vedligehold', en: 'Service registration and maintenance', de: 'Serviceerfassung und Wartung', it: 'Registrazione servizio e manutenzione', hu: 'Szervizregisztráció és karbantartás' } },
      { key: 'service_tickets', title: { da: 'Service tickets', en: 'Service tickets', de: 'Service-Tickets', it: 'Ticket di assistenza', hu: 'Szervizjegyek' } },
      { key: 'machine_search',  title: { da: 'Søg på maskine', en: 'Search machine', de: 'Maschine suchen', it: 'Cerca macchina', hu: 'Gép keresése' } },
    ],

  },
  {
    id: 'salg_marketing',
    title: { da: 'Salg & Marketing', en: 'Sales & Marketing', de: 'Vertrieb & Marketing', it: 'Vendite & Marketing', hu: 'Értékesítés & Marketing' },
    description: {
      da: 'Konfigurator, tilbud, ordrer og salgsværktøjer.',
      en: 'Configurator, quotes, orders and sales tools.',
      de: 'Konfigurator, Angebote, Bestellungen und Vertriebstools.',
      it: 'Configuratore, preventivi, ordini e strumenti di vendita.',
      hu: 'Konfigurátor, árajánlatok, rendelések és értékesítési eszközök.',
    },
    moduleIds: ['configurator', 'videos', 'resources', 'misc'],
    placeholders: [],
  },
  {
    id: 'timan_crm',
    title: { da: 'Timan CRM', en: 'Timan CRM', de: 'Timan CRM', it: 'Timan CRM', hu: 'Timan CRM' },
    description: {
      da: 'Forhandlere, kontakter, aktiviteter og pipeline.',
      en: 'Dealers, contacts, activities and pipeline.',
      de: 'Händler, Kontakte, Aktivitäten und Pipeline.',
      it: 'Rivenditori, contatti, attività e pipeline.',
      hu: 'Kereskedők, kapcsolatok, tevékenységek és pipeline.',
    },
    moduleIds: [],
    placeholders: [],
  },
  {
    id: 'timan_backend',
    title: { da: 'Timan Backend', en: 'Timan Backend', de: 'Timan Backend', it: 'Timan Backend', hu: 'Timan Backend' },
    description: {
      da: 'Brugere, roller, modul-adgang og audit log.',
      en: 'Users, roles, module access and audit log.',
      de: 'Benutzer, Rollen, Modulzugriff und Audit-Log.',
      it: 'Utenti, ruoli, accesso ai moduli e registro di controllo.',
      hu: 'Felhasználók, szerepkörök, modul-hozzáférés és audit napló.',
    },
    moduleIds: [],
    placeholders: [
      { key: 'users',     title: { da: 'Brugere', en: 'Users', de: 'Benutzer', it: 'Utenti', hu: 'Felhasználók' } },
      { key: 'roles',     title: { da: 'Roller', en: 'Roles', de: 'Rollen', it: 'Ruoli', hu: 'Szerepkörök' } },
      { key: 'module_access', title: { da: 'Modul-adgang', en: 'Module access', de: 'Modulzugriff', it: 'Accesso ai moduli', hu: 'Modul-hozzáférés' } },
      { key: 'audit',     title: { da: 'Audit log', en: 'Audit log', de: 'Audit-Log', it: 'Registro di controllo', hu: 'Audit napló' } },
      { key: 'portal_analytics', title: { da: 'Portal Analytics', en: 'Portal Analytics', de: 'Portal-Analytik', it: 'Analisi Portale', hu: 'Portál analitika' } },
      { key: 'dealer_accounts', title: { da: 'Forhandlere', en: 'Dealer accounts', de: 'Händlerkonten', it: 'Account rivenditori', hu: 'Kereskedői fiókok' } },
      { key: 'price_lists', title: { da: 'Prislister', en: 'Price lists', de: 'Preislisten', it: 'Listini prezzi', hu: 'Árlisták' } },
      { key: 'budget_import', title: { da: 'Budgetimport', en: 'Budget import', de: 'Budget-Import', it: 'Import budget', hu: 'Budget importálás' } },
    ],
  },
];

/**
 * Phase 1 visibility:
 * Mapped against existing roles in this project (slutkunde | partner | timan_saelger).
 * Future roles (Timan Backend / Service / Importør / Service Partner / Dealer User) will be
 * introduced together with the new app_users schema in a later phase.
 */
/**
 * Phase 1B visibility — driven by the unified portal role / module-access map.
 * Falls back to the legacy role check when no portal role can be derived
 * (keeps existing logins working).
 */
export function isAreaVisible(
  area: PortalArea,
  user: (AppUser & { portal_role?: string | null; module_access?: string[] | null; allowed_areas?: string[] | null }) | null,
): boolean {
  if (!user) return false;
  if (user.role === 'slutkunde') return false;

  const portalRole = derivePortalRole(user);
  const key: ModuleAccessKey = area.id;

  // Highest priority: explicit per-user `allowed_areas` set in Backend → Brugere.
  // If the admin saved an allowed_areas list, it is the source of truth for
  // which area cards/pages this user can see. An empty/null array falls
  // through to role defaults so legacy rows aren't accidentally locked out.
  const allowed = user.allowed_areas;
  if (Array.isArray(allowed) && allowed.length > 0) {
    return allowed.includes(area.id);
  }

  if (portalRole) {
    return hasModuleAccess(portalRole, key, user.module_access as ModuleAccessKey[] | null | undefined);
  }

  switch (area.id) {
    case 'salg_marketing':
    case 'teknik_service':
      return user.role === 'timan_saelger' || user.role === 'partner';
    case 'timan_crm':
    case 'timan_backend':
      return false;
    default:
      return false;
  }
}
