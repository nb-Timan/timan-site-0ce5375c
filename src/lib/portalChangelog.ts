// Portal change log — Phase 1 (hardcoded entries + localStorage read tracking).
//
// To add or edit changes: append to / modify CHANGELOG_ENTRIES below.
// Newest entries first. `changed_at` is an ISO timestamp.
//
// Future Supabase phase only needs to swap the entry source and the
// `localReadStore` adapter — the UI reads everything via `useChangelog()`.

import { useCallback, useSyncExternalStore } from 'react';
import { Language } from '@/types/configurator';
import { PortalAreaId } from '@/lib/portalAreas';
import type { SessionUser } from '@/context/AppUserContext';

// ---------- Types ----------

export type ModuleKey =
  | 'partner_map'
  | 'dealer_data'
  | 'crm'
  | 'warranty'
  | 'claims'
  | 'configurator'
  | 'backend';

export interface ChangeLogEntry {
  id: string;
  module_key: ModuleKey;
  module_name: Record<Language, string>;
  /** ISO timestamp of when the change went live. */
  changed_at: string;
  title: Record<Language, string>;
  description?: Record<Language, string>;
  /** If set, only these portal_role values may see it. Undefined = everyone. */
  role_visibility?: string[];
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
  dealer_data: 'dealer_data',
  crm: 'timan_crm',
  warranty: 'teknik_service',
  claims: 'teknik_service',
  configurator: 'salg_marketing',
  backend: 'timan_backend',
};

const MODULE_HREF: Partial<Record<ModuleKey, string>> = {
  partner_map: '/portal/misc/partner-map',
  dealer_data: '/portal/dealer-data',
  crm: '/portal/crm',
  warranty: '/portal/service/warranty',
  claims: '/portal/service/claims',
  configurator: '/configurator',
  backend: '/portal/backend',
};

export function areaForModule(key: ModuleKey): PortalAreaId | null {
  return MODULE_AREA[key];
}
export function hrefForEntry(entry: ChangeLogEntry): string | null {
  return MODULE_HREF[entry.module_key] || null;
}

// ---------- Hardcoded demo entries (newest first) ----------

const M = {
  partner_map: {
    da: 'Partnerkort', en: 'Partner map', de: 'Partnerkarte', it: 'Mappa partner', hu: 'Partnertérkép',
  },
  dealer_data: {
    da: 'Forhandlerdata', en: 'Dealer data', de: 'Händlerdaten', it: 'Dati rivenditore', hu: 'Kereskedői adatok',
  },
  crm: { da: 'CRM', en: 'CRM', de: 'CRM', it: 'CRM', hu: 'CRM' },
  warranty: {
    da: 'Garantiregistrering', en: 'Warranty registration', de: 'Garantieregistrierung',
    it: 'Registrazione garanzia', hu: 'Garanciaregisztráció',
  },
  claims: {
    da: 'Reklamationer', en: 'Claims', de: 'Reklamationen', it: 'Reclami', hu: 'Reklamációk',
  },
} as const;

export const CHANGELOG_ENTRIES: ChangeLogEntry[] = [
  {
    id: '2026-06-06-partner-map',
    module_key: 'partner_map',
    module_name: M.partner_map,
    changed_at: '2026-06-06T09:32:00Z',
    is_major: true,
    is_new_until: '2026-06-20T00:00:00Z',
    title: {
      da: 'Adresseforslag og kortforbedringer',
      en: 'Address suggestions and map improvements',
      de: 'Adressvorschläge und Kartenverbesserungen',
      it: 'Suggerimenti di indirizzo e miglioramenti mappa',
      hu: 'Címjavaslatok és térképfejlesztések',
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
    is_new_until: '2026-06-20T00:00:00Z',
    title: {
      da: 'Nye adressefelter',
      en: 'New address fields',
      de: 'Neue Adressfelder',
      it: 'Nuovi campi indirizzo',
      hu: 'Új címmezők',
    },
    description: {
      da: 'Adresse gemmer nu også koordinater og Google place id.',
      en: 'Address now also stores coordinates and Google place id.',
      de: 'Die Adresse speichert jetzt auch Koordinaten und Google-Place-ID.',
      it: 'L\u2019indirizzo memorizza ora anche le coordinate e il Google place id.',
      hu: 'A cím most már a koordinátákat és a Google place id-t is tárolja.',
    },
  },
  {
    id: '2026-06-05-crm-budget',
    module_key: 'crm',
    module_name: M.crm,
    changed_at: '2026-06-05T14:10:00Z',
    title: {
      da: 'Budgetvisning rettet',
      en: 'Budget view fixed',
      de: 'Budgetansicht korrigiert',
      it: 'Visualizzazione budget corretta',
      hu: 'Költségvetés-nézet javítva',
    },
  },
  {
    id: '2026-06-04-warranty',
    module_key: 'warranty',
    module_name: M.warranty,
    changed_at: '2026-06-04T11:00:00Z',
    title: {
      da: 'Geokodning af kundeadresser',
      en: 'Customer address geocoding',
      de: 'Geokodierung der Kundenadressen',
      it: 'Geocodifica indirizzi cliente',
      hu: 'Ügyfélcímek geokódolása',
    },
  },
  {
    id: '2026-06-03-claims',
    module_key: 'claims',
    module_name: M.claims,
    changed_at: '2026-06-03T08:45:00Z',
    title: {
      da: 'Hurtigere oprettelse af sag',
      en: 'Faster case creation',
      de: 'Schnellere Fallerstellung',
      it: 'Creazione caso più rapida',
      hu: 'Gyorsabb ügylétrehozás',
    },
  },
];

// ---------- User key & visibility ----------

export function getUserKey(user: Pick<SessionUser, 'email' | 'portal_role' | 'role'> | null): string {
  if (!user) return 'anon';
  const email = (user.email || 'anon').toLowerCase();
  const role = (user.portal_role || user.role || 'unknown').toString();
  return `${email}::${role}`;
}

function isEntryVisible(
  entry: ChangeLogEntry,
  user: Pick<SessionUser, 'portal_role' | 'role'> | null,
  language: Language,
): boolean {
  if (entry.languages && !entry.languages.includes(language)) return false;
  if (entry.role_visibility && entry.role_visibility.length > 0) {
    const role = user?.portal_role || user?.role;
    if (!role || !entry.role_visibility.includes(String(role))) return false;
  }
  return true;
}

export function getVisibleEntries(
  user: Pick<SessionUser, 'email' | 'portal_role' | 'role'> | null,
  language: Language,
): ChangeLogEntry[] {
  return CHANGELOG_ENTRIES
    .filter(e => isEntryVisible(e, user, language))
    .slice()
    .sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1));
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

// ---------- Hook ----------

export interface UseChangelogResult {
  entries: ChangeLogEntry[];
  readIds: Set<string>;
  isRead: (id: string) => boolean;
  entriesForArea: (areaId: PortalAreaId) => ChangeLogEntry[];
  latestForArea: (areaId: PortalAreaId) => ChangeLogEntry | null;
  hasUnreadForArea: (areaId: PortalAreaId) => boolean;
  markEntryRead: (id: string) => void;
  markAreaRead: (areaId: PortalAreaId) => void;
}

export function useChangelog(
  user: Pick<SessionUser, 'email' | 'portal_role' | 'role'> | null,
  language: Language,
): UseChangelogResult {
  const userKey = getUserKey(user);

  const subscribe = useCallback((cb: () => void) => localReadStore.subscribe(cb), []);
  const getSnapshot = useCallback(() => {
    const ids = Array.from(localReadStore.getReadIds(userKey)).sort();
    return `${userKey}|${ids.join(',')}`;
  }, [userKey]);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const readIds = localReadStore.getReadIds(userKey);
  const entries = getVisibleEntries(user, language);

  const entriesForArea = (areaId: PortalAreaId) =>
    entries.filter(e => areaForModule(e.module_key) === areaId);

  return {
    entries,
    readIds,
    isRead: (id) => readIds.has(id),
    entriesForArea,
    latestForArea: (areaId) => entriesForArea(areaId)[0] || null,
    hasUnreadForArea: (areaId) =>
      entriesForArea(areaId).some(e => !readIds.has(e.id)),
    markEntryRead: (id) => localReadStore.markRead(userKey, [id]),
    markAreaRead: (areaId) =>
      localReadStore.markRead(userKey, entriesForArea(areaId).map(e => e.id)),
  };
}
