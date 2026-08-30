// Phase 1: Portal area grouping for "Velkommen til Timan Portalen".
// Existing modules from portalModules.ts are grouped under "Salg & Marketing".
// Teknik & Service and Timan Backend are placeholders for now (modules imported in later phases).
// IMPORTANT: This file does NOT change pricing, configurator, auth or order logic.

import { AppUser } from '@/data/appUsers';
import { Language } from '@/types/configurator';
import { PortalModuleId } from '@/lib/portalModules';
import { hasAreaAccess } from '@/lib/portalAccess';

export type PortalAreaId = 'teknik_service' | 'salg_marketing' | 'calendar' | 'marketing' | 'timan_crm' | 'timan_backend' | 'dealer_data';

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
    id: 'salg_marketing',
    title: { da: 'Salg', en: 'Sales', de: 'Vertrieb', it: 'Vendite', hu: 'Értékesítés' },
    description: {
      da: 'Konfigurator, tilbud, ordrer og salgsværktøjer.',
      en: 'Configurator, quotes, orders and sales tools.',
      de: 'Konfigurator, Angebote, Bestellungen und Vertriebstools.',
      it: 'Configuratore, preventivi, ordini e strumenti di vendita.',
      hu: 'Konfigurátor, árajánlatok, rendelések és értékesítési eszközök.',
    },
    moduleIds: ['configurator', 'videos', 'resources', 'misc', 'contracts'],
    placeholders: [],
  },
  {
    id: 'calendar',
    title: { da: 'Kalender', en: 'Calendar', de: 'Kalender', it: 'Calendario', hu: 'Naptár' },
    description: {
      da: 'Planlagte aktiviteter, opfølgninger og sælgeraftaler.',
      en: 'Planned activities, follow-ups and seller appointments.',
      de: 'Geplante Aktivitäten, Nachfassaktionen und Verkäufertermine.',
      it: 'Attività pianificate, follow-up e appuntamenti dei venditori.',
      hu: 'Tervezett tevékenységek, utánkövetések és értékesítői találkozók.',
    },
    moduleIds: [],
    placeholders: [],
  },
  {
    id: 'marketing',
    title: { da: 'Marketing', en: 'Marketing', de: 'Marketing', it: 'Marketing', hu: 'Marketing' },
    description: {
      da: 'Nyheder, kampagner og publicering til Seneste nyt.',
      en: 'News, campaigns and publishing to Latest news.',
      de: 'Neuigkeiten, Kampagnen und Veröffentlichung für Aktuelles.',
      it: 'Notizie, campagne e pubblicazione nelle ultime novità.',
      hu: 'Hírek, kampányok és publikálás a legfrissebb hírekhez.',
    },
    moduleIds: [],
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
    id: 'teknik_service',
    title: { da: 'Teknik & Service', en: 'Technical & Service', de: 'Technik & Service', it: 'Tecnico & Assistenza', hu: 'Műszaki & Szerviz' },
    description: {
      da: 'Service, garanti, TSB og teknisk information.',
      en: 'Service, warranty, TSB and technical information.',
      de: 'Service, Garantie, TSB und technische Informationen.',
      it: 'Assistenza, garanzia, TSB e informazioni tecniche.',
      hu: 'Szerviz, garancia, TSB és műszaki információk.',
    },
    moduleIds: [],
    placeholders: [
      { key: 'machine_search',  title: { da: 'Søg på maskine', en: 'Search machine', de: 'Maschine suchen', it: 'Cerca macchina', hu: 'Gép keresése' } },
      { key: 'service_tickets', title: { da: 'Service tickets', en: 'Service tickets', de: 'Service-Tickets', it: 'Ticket di assistenza', hu: 'Szervizjegyek' } },
      { key: 'service_maintenance', title: { da: 'Service registrering og vedligehold', en: 'Service registration and maintenance', de: 'Serviceerfassung und Wartung', it: 'Registrazione servizio e manutenzione', hu: 'Szervizregisztráció és karbantartás' } },
      { key: 'claims',        title: { da: 'Claims', en: 'Claims', de: 'Reklamationen', it: 'Reclami', hu: 'Reklamációk' } },
      { key: 'warranty_reg',    title: { da: 'Garantiregistrering', en: 'Warranty registration', de: 'Garantieregistrierung', it: 'Registrazione garanzia', hu: 'Garanciaregisztráció' } },
      { key: 'tsb_portal',      title: { da: 'TSB / Technical Service Bulletin', en: 'TSB / Technical Service Bulletin', de: 'TSB / Technical Service Bulletin', it: 'TSB / Technical Service Bulletin', hu: 'TSB / Technical Service Bulletin' } },
    ],

  },
  {
    id: 'dealer_data',
    title: { da: 'Partnerdata', en: 'Partner data', de: 'Partnerdaten', it: 'Dati partner', hu: 'Partneradatok' },
    description: {
      da: 'Stamdata, kontaktinformation, brugere og dine tilbud/ordrer.',
      en: 'Master data, contacts, users and your quotes/orders.',
      de: 'Stammdaten, Kontakte, Benutzer und Ihre Angebote/Bestellungen.',
      it: 'Anagrafica, contatti, utenti e preventivi/ordini.',
      hu: 'Törzsadatok, kapcsolatok, felhasználók és árajánlatok/rendelések.',
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
  user: (AppUser & {
    portal_role?: string | null;
    module_access?: string[] | null;
    allowed_areas?: string[] | null;
    allowed_modules?: string[] | null;
  }) | null,
): boolean {
  return hasAreaAccess(user, area.id);
}
