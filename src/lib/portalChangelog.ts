// Portal change log — Phase 2 (hardcoded entries + per-user read tracking + role filter + translations).
//
// To add or edit changes: append to / modify CHANGELOG_ENTRIES below.
// Newest entries first. `changed_at` is an ISO timestamp.
//
// Future Supabase phase only needs to swap the entry source and the
// `localReadStore` adapter — the UI reads everything via the helpers /
// `useChangelog()` hook here.

import { useCallback, useSyncExternalStore } from 'react';
import { Language } from '@/types/configurator';
import { PortalAreaId } from '@/lib/portalAreas';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { SessionUser } from '@/context/AppUserContext';
import {
  subscribeChangelog,
  getChangelogSnapshot,
  getEntriesForLanguage,
} from './portalChangelogService';


// ---------- Types ----------

export type ModuleKey =
  | 'partner_map'
  | 'misc'
  | 'dealer_data'
  | 'crm'
  | 'warranty'
  | 'claims'
  | 'service'
  | 'configurator'
  | 'backend';

/** Audience buckets used by `role_visibility`. */
export type ChangelogRole =
  | 'all'
  | 'sales'
  | 'service'
  | 'backend'
  | 'admin'
  | 'dealer';

type ChangelogText = Record<Language, string> & Partial<Record<Exclude<PortalUiLanguage, Language>, string>>;

export interface ChangeLogEntry {
  id: string;
  module_key: ModuleKey;
  /**
   * Optional submodule identifier — when set, the entry is attributed to a
   * specific card inside the module's portal area (e.g. 'service_tickets',
   * 'claims', 'warranty_reg', 'service_maintenance', 'machine_search',
   * 'tsb_portal'). Entries without submodule_key are module-level changes.
   */
  submodule_key?: string;
  module_name: ChangelogText;
  /** ISO timestamp of when the change went live. */
  changed_at: string;
  title: ChangelogText;
  description?: ChangelogText;
  /** Short change note shown after the timestamp on module pages. */
  note?: ChangelogText;
  /** Roles allowed to see the entry. Empty / undefined / contains 'all' = everyone. */
  role_visibility?: ChangelogRole[];
  /** If set, only these UI languages render it. Undefined = all languages. */
  languages?: Language[];
  /** Highlighted "Vigtig" indicator in the panel. */
  is_major?: boolean;
  /** Optional ISO date — entry shows "Ny" until this moment. */
  is_new_until?: string;
}

// ---------- Module ↔ portal-area routing ----------

const MODULE_AREA: Record<ModuleKey, PortalAreaId | null> = {
  partner_map: 'salg_marketing',
  misc:        'salg_marketing',
  dealer_data: 'dealer_data',
  crm: 'timan_crm',
  warranty: 'teknik_service',
  claims: 'teknik_service',
  service: 'teknik_service',
  configurator: 'salg_marketing',
  backend: 'timan_backend',
};

const MODULE_HREF: Partial<Record<ModuleKey, string>> = {
  partner_map: '/portal/misc/partner-map',
  misc:        '/portal/misc',
  dealer_data: '/portal/dealer-data',
  crm: '/portal/crm',
  warranty: '/portal/service/warranty',
  claims: '/portal/service/claims',
  service: '/portal/service/maintenance',
  configurator: '/configurator',
  backend: '/portal/backend',
};

export function areaForModule(key: ModuleKey): PortalAreaId | null {
  return MODULE_AREA[key];
}
export function hrefForEntry(entry: ChangeLogEntry): string | null {
  return MODULE_HREF[entry.module_key] || null;
}

// ---------- Translations ----------

export const CHANGELOG_LABELS: Record<
  'whatsNew' | 'latestChanges' | 'lastChanged' | 'changed' | 'updated'
  | 'important' | 'newTag' | 'viewAll' | 'empty',
  ChangelogText
> = {
  whatsNew:     { da: 'Hvad er nyt?', en: 'What\u2019s new?', de: 'Was ist neu?', it: 'Cosa c\u2019è di nuovo?', hu: 'Mi az új?', fr: 'Quoi de neuf ?', pl: 'Co nowego?', cs: 'Co je nového?' },
  latestChanges:{ da: 'Seneste ændringer', en: 'Latest changes', de: 'Letzte Änderungen', it: 'Ultime modifiche', hu: 'Legutóbbi változások', fr: 'Dernières modifications', pl: 'Najnowsze zmiany', cs: 'Poslední změny' },
  lastChanged:  { da: 'Senest ændret', en: 'Last changed', de: 'Zuletzt geändert', it: 'Ultima modifica', hu: 'Utoljára módosítva', fr: 'Dernière modification', pl: 'Ostatnia zmiana', cs: 'Naposledy změněno' },
  changed:      { da: 'Ændret', en: 'Changed', de: 'Geändert', it: 'Modificato', hu: 'Módosítva', fr: 'Modifié', pl: 'Zmieniono', cs: 'Změněno' },
  updated:      { da: 'Opdateret', en: 'Updated', de: 'Aktualisiert', it: 'Aggiornato', hu: 'Frissítve', fr: 'Mis à jour', pl: 'Zaktualizowano', cs: 'Aktualizováno' },
  important:    { da: 'Vigtig', en: 'Important', de: 'Wichtig', it: 'Importante', hu: 'Fontos', fr: 'Important', pl: 'Ważne', cs: 'Důležité' },
  newTag:       { da: 'Ny', en: 'New', de: 'Neu', it: 'Nuovo', hu: 'Új', fr: 'Nouveau', pl: 'Nowe', cs: 'Nové' },
  viewAll:      { da: 'Se alle ændringer', en: 'View all changes', de: 'Alle Änderungen anzeigen', it: 'Vedi tutte le modifiche', hu: 'Összes változás', fr: 'Voir toutes les modifications', pl: 'Zobacz wszystkie zmiany', cs: 'Zobrazit všechny změny' },
  empty:        { da: 'Ingen ændringer endnu.', en: 'No changes yet.', de: 'Noch keine Änderungen.', it: 'Ancora nessuna modifica.', hu: 'Még nincsenek változások.', fr: 'Aucune modification pour le moment.', pl: 'Brak zmian.', cs: 'Zatím žádné změny.' },
};

export function t(key: keyof typeof CHANGELOG_LABELS, language: PortalUiLanguage): string {
  return CHANGELOG_LABELS[key][language] || CHANGELOG_LABELS[key].da;
}

// ---------- Hardcoded demo entries (newest first) ----------

const M = {
  partner_map: { da: 'Partnerkort', en: 'Partner map', de: 'Partnerkarte', it: 'Mappa partner', hu: 'Partnertérkép' },
  misc:        { da: 'Formularer', en: 'Forms', de: 'Formulare', it: 'Moduli', hu: 'Űrlapok' },
  dealer_data: { da: 'Forhandlerdata', en: 'Dealer data', de: 'Händlerdaten', it: 'Dati rivenditore', hu: 'Kereskedői adatok' },
  crm:         { da: 'CRM', en: 'CRM', de: 'CRM', it: 'CRM', hu: 'CRM' },
  warranty:    { da: 'Garantiregistrering', en: 'Warranty registration', de: 'Garantieregistrierung', it: 'Registrazione garanzia', hu: 'Garanciaregisztráció' },
  claims:      { da: 'Reklamationer', en: 'Claims', de: 'Reklamationen', it: 'Reclami', hu: 'Reklamációk' },
  service:     { da: 'Service', en: 'Service', de: 'Service', it: 'Assistenza', hu: 'Szerviz' },
  backend:     { da: 'Backend', en: 'Backend', de: 'Backend', it: 'Backend', hu: 'Backend' },
} as const;

export const CHANGELOG_ENTRIES: ChangeLogEntry[] = [
  {
    id: '2026-06-06-partner-map',
    module_key: 'misc',
    submodule_key: 'partner_map',
    module_name: M.misc,
    changed_at: '2026-06-06T09:32:00Z',
    role_visibility: ['all'],
    is_major: true,
    is_new_until: '2026-06-20T00:00:00Z',
    title: {
      da: 'Adresseforslag og kortforbedringer',
      en: 'Address suggestions and map improvements',
      de: 'Adressvorschläge und Kartenverbesserungen',
      it: 'Suggerimenti di indirizzo e miglioramenti mappa',
      hu: 'Címjavaslatok és térképfejlesztések',
    },
    note: {
      da: 'Partnerkort forbedret',
      en: 'Partner map improved',
      de: 'Partnerkarte verbessert',
      it: 'Mappa partner migliorata',
      hu: 'Partnertérkép továbbfejlesztve',
    },
    description: {
      da: 'Google adresseforslag i alle adressefelter samt Standard/Satellit/Terræn/Mørk i Partnerkort.',
      en: 'Google address suggestions in all address fields, plus Standard/Satellite/Terrain/Dark layers on the Partner map.',
      de: 'Google-Adressvorschläge in allen Adressfeldern, sowie Standard/Satellit/Gelände/Dunkel auf der Partnerkarte.',
      it: 'Suggerimenti indirizzo Google in tutti i campi e livelli Standard/Satellite/Terreno/Scuro nella mappa.',
      hu: 'Google címjavaslatok minden címmezőben és Standard/Műhold/Domborzat/Sötét rétegek a partnertérképen.',
    },
  },
  {
    id: '2026-06-06-dealer-data',
    module_key: 'dealer_data',
    module_name: M.dealer_data,
    changed_at: '2026-06-06T09:15:00Z',
    role_visibility: ['all'],
    is_new_until: '2026-06-20T00:00:00Z',
    title: {
      da: 'Nye adressefelter',
      en: 'New address fields',
      de: 'Neue Adressfelder',
      it: 'Nuovi campi indirizzo',
      hu: 'Új címmezők',
    },
    note: {
      da: 'Adresseforslag tilføjet',
      en: 'Address suggestions added',
      de: 'Adressvorschläge hinzugefügt',
      it: 'Suggerimenti di indirizzo aggiunti',
      hu: 'Címjavaslatok hozzáadva',
    },
  },
  {
    id: '2026-06-05-crm-budget',
    module_key: 'crm',
    module_name: M.crm,
    changed_at: '2026-06-05T14:10:00Z',
    role_visibility: ['sales', 'backend', 'admin'],
    title: {
      da: 'Budgetvisning rettet',
      en: 'Budget view fixed',
      de: 'Budgetansicht korrigiert',
      it: 'Visualizzazione budget corretta',
      hu: 'Költségvetés-nézet javítva',
      fr: 'Vue budget corrigée',
      pl: 'Widok budżetu poprawiony',
      cs: 'Zobrazení rozpočtu opraveno',
    },
    note: {
      da: 'Budgetvisning rettet',
      en: 'Budget view fixed',
      de: 'Budgetansicht korrigiert',
      it: 'Visualizzazione budget corretta',
      hu: 'Költségvetés-nézet javítva',
      fr: 'Vue budget corrigée',
      pl: 'Widok budżetu poprawiony',
      cs: 'Zobrazení rozpočtu opraveno',
    },
  },
  {
    id: '2026-06-04-warranty',
    module_key: 'warranty',
    module_name: M.warranty,
    changed_at: '2026-06-04T11:00:00Z',
    role_visibility: ['service', 'backend', 'dealer', 'admin'],
    title: {
      da: 'Geokodning af kundeadresser',
      en: 'Customer address geocoding',
      de: 'Geokodierung der Kundenadressen',
      it: 'Geocodifica indirizzi cliente',
      hu: 'Ügyfélcímek geokódolása',
    },
    note: {
      da: 'Kundeadresser geokodes nu',
      en: 'Customer addresses are now geocoded',
      de: 'Kundenadressen werden jetzt geokodiert',
      it: 'Gli indirizzi cliente vengono ora geocodificati',
      hu: 'Az ügyfélcímek most geokódolva',
    },
  },
  {
    id: '2026-06-03-claims',
    module_key: 'claims',
    module_name: M.claims,
    changed_at: '2026-06-03T08:45:00Z',
    role_visibility: ['service', 'backend', 'dealer', 'admin'],
    title: {
      da: 'Hurtigere oprettelse af sag',
      en: 'Faster case creation',
      de: 'Schnellere Fallerstellung',
      it: 'Creazione caso più rapida',
      hu: 'Gyorsabb ügylétrehozás',
    },
    note: {
      da: 'Hurtigere oprettelse',
      en: 'Faster creation',
      de: 'Schnellere Erstellung',
      it: 'Creazione più rapida',
      hu: 'Gyorsabb létrehozás',
    },
  },
];

// ---------- User key (for per-user read tracking) ----------

export function getUserKey(user: Pick<SessionUser, 'email' | 'portal_role' | 'role'> | null): string {
  if (!user) return 'anon';
  const email = (user.email || 'anon').toLowerCase();
  const role = (user.portal_role || user.role || 'unknown').toString();
  return `${email}::${role}`;
}

// ---------- Role mapping ----------

/**
 * Translate the session user's portal_role / legacy role into the changelog
 * audience buckets used by `role_visibility`. Returns the set of buckets the
 * user belongs to. Everyone always belongs to 'all'.
 */
export function mapUserToChangelogRoles(
  user: Pick<SessionUser, 'portal_role' | 'role'> | null,
): Set<ChangelogRole> {
  const out = new Set<ChangelogRole>(['all']);
  if (!user) return out;
  const portalRole = (user.portal_role || '').toString();
  const legacy = (user.role || '').toString();
  switch (portalRole) {
    case 'timan_backend':
      out.add('backend'); out.add('admin'); out.add('sales'); out.add('service'); break;
    case 'timan_seller':
      out.add('sales'); break;
    case 'timan_service':
      out.add('service'); break;
    case 'timan_importer':
    case 'timan_dealer':
    case 'timan_service_partner':
    case 'dealer_user':
      out.add('dealer'); break;
  }
  if (legacy === 'timan_saelger') out.add('sales');
  if (legacy === 'partner') out.add('dealer');
  return out;
}

function isEntryVisible(
  entry: ChangeLogEntry,
  user: Pick<SessionUser, 'portal_role' | 'role'> | null,
  language: Language,
): boolean {
  if (entry.languages && !entry.languages.includes(language)) return false;
  const vis = entry.role_visibility;
  if (vis && vis.length > 0 && !vis.includes('all')) {
    const userRoles = mapUserToChangelogRoles(user);
    if (!vis.some(r => userRoles.has(r))) return false;
  }
  return true;
}

// ---------- Queries ----------

export function getVisibleEntries(
  user: Pick<SessionUser, 'email' | 'portal_role' | 'role'> | null,
  language: Language,
): ChangeLogEntry[] {
  return CHANGELOG_ENTRIES
    .filter(e => isEntryVisible(e, user, language))
    .slice()
    .sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1));
}

/** Recent changes for the user's roles, newest first. */
export function getRecentChangesForRole(
  user: Pick<SessionUser, 'email' | 'portal_role' | 'role'> | null,
  language: Language,
  limit = 5,
): ChangeLogEntry[] {
  return getVisibleEntries(user, language).slice(0, limit);
}

/** Latest visible change for a specific module, or null. */
export function getLatestChangeForModule(
  moduleKey: ModuleKey,
  user: Pick<SessionUser, 'email' | 'portal_role' | 'role'> | null,
  language: Language,
): ChangeLogEntry | null {
  return getVisibleEntries(user, language).find(e => e.module_key === moduleKey) || null;
}

// ---------- Storage adapter ----------

const STORAGE_PREFIX = 'timan.portalChangeLogReads.v1::';
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(l => { try { l(); } catch { /* ignore */ } });
}

const localReadStore = {
  getReadIds(userKey: string): Set<string> {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + userKey);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((x): x is string => typeof x === 'string'));
    } catch {
      return new Set();
    }
  },
  markRead(userKey: string, ids: string[]) {
    if (ids.length === 0) return;
    const current = this.getReadIds(userKey);
    let changed = false;
    for (const id of ids) if (!current.has(id)) { current.add(id); changed = true; }
    if (!changed) return;
    try { localStorage.setItem(STORAGE_PREFIX + userKey, JSON.stringify(Array.from(current))); } catch { /* ignore */ }
    notify();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => { if (e.key && e.key.startsWith(STORAGE_PREFIX)) listener(); };
    window.addEventListener('storage', onStorage);
    return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
  },
};

// ---------- Formatting helpers ----------

/** "06-06-26 · 09:32" (Danish locale convention). */
export function formatChangedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yy} \u00b7 ${hh}:${mi}`;
}

/** "06-06-26" — used in the front-page panel rows. */
export function formatChangedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  return `${dd}-${mm}-${yy}`;
}

export function isStillNew(entry: ChangeLogEntry): boolean {
  if (!entry.is_new_until) return false;
  const t = new Date(entry.is_new_until).getTime();
  return Number.isFinite(t) && t > Date.now();
}


// ---------- Submodule + module aliasing ----------

/**
 * Map alternative submodule_key spellings (as authors may use them in the
 * admin form, e.g. 'warranty' / 'tsb' / 'service_registration') to the
 * canonical placeholder key used by PortalAreaPage (e.g. 'warranty_reg',
 * 'tsb_portal', 'service_maintenance'). Unknown keys are returned as-is.
 */
const SUBMODULE_ALIAS: Record<string, string> = {
  warranty: 'warranty_reg',
  tsb: 'tsb_portal',
  service_registration: 'service_maintenance',
  partnerkort: 'partner_map',
  partners: 'partner_map',
  misc_partner_map: 'partner_map',
};
export function normalizeSubmoduleKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const k = key.trim();
  return SUBMODULE_ALIAS[k] || k;
}

/**
 * Map legacy / alternative module_key values to a canonical
 * { module_key, submodule_key } pair. Used so older entries authored as
 * standalone modules (e.g. 'partner_map', 'partnerkort') get attributed to
 * the right area card AND the right submodule card under it.
 */
const MODULE_REROUTE: Record<string, { module: ModuleKey; submodule: string }> = {
  partner_map:      { module: 'misc', submodule: 'partner_map' },
  partnerkort:      { module: 'misc', submodule: 'partner_map' },
  partners:         { module: 'misc', submodule: 'partner_map' },
  misc_partner_map: { module: 'misc', submodule: 'partner_map' },
};
function normalizeEntry(entry: ChangeLogEntry): ChangeLogEntry {
  const reroute = MODULE_REROUTE[entry.module_key as string];
  const subNorm = normalizeSubmoduleKey(entry.submodule_key) ?? undefined;
  if (!reroute && subNorm === entry.submodule_key) return entry;
  return {
    ...entry,
    module_key: reroute ? reroute.module : entry.module_key,
    submodule_key: subNorm ?? (reroute ? reroute.submodule : undefined),
  };
}

// ---------- Hook ----------

export interface SubmoduleBadge {
  kind: 'new' | 'major';
  count: number;
  latest: ChangeLogEntry;
}

export interface UseChangelogResult {
  entries: ChangeLogEntry[];
  readIds: Set<string>;
  isRead: (id: string) => boolean;
  entriesForArea: (areaId: PortalAreaId) => ChangeLogEntry[];
  latestForArea: (areaId: PortalAreaId) => ChangeLogEntry | null;
  latestForModule: (moduleKey: ModuleKey) => ChangeLogEntry | null;
  hasUnreadForArea: (areaId: PortalAreaId) => boolean;
  /** Number of unread visible entries in the area (module-level + submodule). */
  unreadCountForArea: (areaId: PortalAreaId) => number;
  /** True if any unread visible entry in the area is_major. */
  hasMajorUnreadForArea: (areaId: PortalAreaId) => boolean;
  /** Unread badge for a specific submodule card (key uses canonical placeholder spelling). */
  submoduleBadge: (submoduleKey: string) => SubmoduleBadge | null;
  /** Unread badge for a specific module card (e.g. 'misc' card inside an area). */
  moduleBadge: (moduleKey: ModuleKey | string) => SubmoduleBadge | null;
  /** Number of unread visible entries for a specific module. */
  unreadCountForModule: (moduleKey: ModuleKey | string) => number;
  /** True if any unread visible entry for the module is_major. */
  hasMajorUnreadForModule: (moduleKey: ModuleKey | string) => boolean;
  markEntryRead: (id: string) => void;
  /** Marks module-level area entries read (entries without submodule_key). */
  markAreaRead: (areaId: PortalAreaId) => void;
  markModuleRead: (moduleKey: ModuleKey) => void;
  markSubmoduleRead: (submoduleKey: string) => void;
}

export function useChangelog(
  user: Pick<SessionUser, 'email' | 'portal_role' | 'role'> | null,
  language: Language,
): UseChangelogResult {
  const userKey = getUserKey(user);

  const subscribe = useCallback((cb: () => void) => {
    const off1 = localReadStore.subscribe(cb);
    const off2 = subscribeChangelog(cb);
    return () => { off1(); off2(); };
  }, []);
  const getSnapshot = useCallback(() => {
    const ids = Array.from(localReadStore.getReadIds(userKey)).sort();
    return `${userKey}|${ids.join(',')}|${getChangelogSnapshot()}|${language}`;
  }, [userKey, language]);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const readIds = localReadStore.getReadIds(userKey);
  const rawEntries = getEntriesForLanguage(language);


  const entries = rawEntries
    .map(normalizeEntry)
    .filter(e => isEntryVisible(e, user, language))
    .slice()
    .sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1));

  const entriesForArea = (areaId: PortalAreaId) =>
    entries.filter(e => areaForModule(e.module_key) === areaId);

  const entriesForModule = (moduleKey: ModuleKey | string) =>
    entries.filter(e => e.module_key === (moduleKey as ModuleKey));

  const entriesForSubmodule = (submoduleKey: string) => {
    const target = normalizeSubmoduleKey(submoduleKey);
    return entries.filter(e => normalizeSubmoduleKey(e.submodule_key) === target);
  };

  return {
    entries,
    readIds,
    isRead: (id) => readIds.has(id),
    entriesForArea,
    latestForArea: (areaId) => entriesForArea(areaId)[0] || null,
    latestForModule: (moduleKey) => entries.find(e => e.module_key === moduleKey) || null,
    hasUnreadForArea: (areaId) =>
      entriesForArea(areaId).some(e => !readIds.has(e.id)),
    unreadCountForArea: (areaId) =>
      entriesForArea(areaId).filter(e => !readIds.has(e.id)).length,
    hasMajorUnreadForArea: (areaId) =>
      entriesForArea(areaId).some(e => !readIds.has(e.id) && !!e.is_major),
    submoduleBadge: (submoduleKey) => {
      const sub = entriesForSubmodule(submoduleKey).filter(e => !readIds.has(e.id));
      if (sub.length === 0) return null;
      const major = sub.find(e => !!e.is_major);
      return {
        kind: major ? 'major' : 'new',
        count: sub.length,
        latest: sub[0],
      };
    },
    moduleBadge: (moduleKey) => {
      const sub = entriesForModule(moduleKey).filter(e => !readIds.has(e.id));
      if (sub.length === 0) return null;
      const major = sub.find(e => !!e.is_major);
      return { kind: major ? 'major' : 'new', count: sub.length, latest: sub[0] };
    },
    unreadCountForModule: (moduleKey) =>
      entriesForModule(moduleKey).filter(e => !readIds.has(e.id)).length,
    hasMajorUnreadForModule: (moduleKey) =>
      entriesForModule(moduleKey).some(e => !readIds.has(e.id) && !!e.is_major),
    markEntryRead: (id) => localReadStore.markRead(userKey, [id]),
    // Mark only module-level area entries read — leaves submodule-tagged
    // entries unread so per-card badges remain until the user opens the
    // matching submodule.
    markAreaRead: (areaId) =>
      localReadStore.markRead(
        userKey,
        entriesForArea(areaId).filter(e => !e.submodule_key).map(e => e.id),
      ),
    markModuleRead: (moduleKey) =>
      localReadStore.markRead(userKey, entries.filter(e => e.module_key === moduleKey).map(e => e.id)),
    markSubmoduleRead: (submoduleKey) =>
      localReadStore.markRead(userKey, entriesForSubmodule(submoduleKey).map(e => e.id)),
  };
}

