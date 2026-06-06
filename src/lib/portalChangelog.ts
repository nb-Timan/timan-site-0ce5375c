// Portal change log — Phase 1 (hardcoded entries + localStorage read tracking).
//
// Architecture is split so a future Supabase phase only needs to swap the
// storage adapter and entry source:
//   - `CHANGELOG_ENTRIES` → replace with `select * from portal_change_log`
//   - `localReadStore`    → replace with `portal_change_log_reads` table
// The UI (`AreaCard` badge, `LatestChanges` panel) reads everything through
// `useChangelog()` and never touches storage directly.
//
// NOTE: Do NOT add Supabase calls here yet — user explicitly asked for
// Phase 1 localStorage only.

import { useCallback, useSyncExternalStore } from 'react';
import { Language } from '@/types/configurator';
import { PortalAreaId } from '@/lib/portalAreas';
import type { SessionUser } from '@/context/AppUserContext';

// ---------- Types ----------

export interface ChangeLogEntry {
  id: string;
  /** Area this change belongs to. `null` = global / not module-specific. */
  areaId: PortalAreaId | null;
  /** Optional sub-route deep-link (e.g. /portal/misc/partner-map). Defaults to the area route. */
  href?: string;
  title: Record<Language, string>;
  body?: Record<Language, string>;
  /** ISO timestamp. */
  publishedAt: string;
  /** If set, only these portal_role values may see the entry. Undefined = everyone. */
  roleVisibility?: string[];
  /** If set, only these UI languages render the entry. Undefined = all languages. */
  languages?: Language[];
  /** Visual tag — defaults to "Opdateret". */
  tag?: 'opdateret' | 'ny';
}

// ---------- Hardcoded entries ----------
//
// Newest first. Keep titles short; bodies are optional.

export const CHANGELOG_ENTRIES: ChangeLogEntry[] = [
  {
    id: '2026-06-07-partner-map-styles',
    areaId: 'salg_marketing',
    href: '/portal/misc/partner-map',
    publishedAt: '2026-06-07T10:00:00Z',
    tag: 'ny',
    title: {
      da: 'Partnerkort: vælg korttype',
      en: 'Partner map: choose map style',
      de: 'Partnerkarte: Kartenstil wählen',
      it: 'Mappa partner: scegli stile',
      hu: 'Partnertérkép: térképstílus',
    },
    body: {
      da: 'Du kan nu skifte mellem Standard, Satellit, Terræn og Mørk i Partnerkortet.',
      en: 'You can now switch between Standard, Satellite, Terrain and Dark on the Partner map.',
      de: 'Wechseln Sie auf der Partnerkarte zwischen Standard, Satellit, Gelände und Dunkel.',
      it: 'Ora puoi passare tra Standard, Satellite, Terreno e Scuro nella mappa partner.',
      hu: 'A partnertérképen válthat Standard, Műhold, Domborzat és Sötét között.',
    },
  },
  {
    id: '2026-06-07-google-places',
    areaId: 'timan_crm',
    publishedAt: '2026-06-07T09:00:00Z',
    tag: 'opdateret',
    title: {
      da: 'Google adresseforslag i CRM-formularer',
      en: 'Google address suggestions in CRM forms',
      de: 'Google-Adressvorschläge in CRM-Formularen',
      it: 'Suggerimenti di indirizzo Google nei moduli CRM',
      hu: 'Google címjavaslatok a CRM űrlapokon',
    },
    body: {
      da: 'Adressefelter foreslår nu Google-adresser og gemmer koordinater automatisk.',
      en: 'Address fields now suggest Google addresses and store coordinates automatically.',
      de: 'Adressfelder schlagen jetzt Google-Adressen vor und speichern Koordinaten automatisch.',
      it: 'I campi indirizzo ora suggeriscono indirizzi Google e salvano le coordinate.',
      hu: 'A címmezők most Google-címeket javasolnak és automatikusan tárolják a koordinátákat.',
    },
  },
  {
    id: '2026-06-06-warranty-geocoding',
    areaId: 'teknik_service',
    publishedAt: '2026-06-06T12:00:00Z',
    tag: 'opdateret',
    title: {
      da: 'Garantiregistreringer: geokodning af kundeadresse',
      en: 'Warranty registrations: customer address geocoding',
      de: 'Garantieregistrierungen: Kundenadresse geokodieren',
      it: 'Registrazioni garanzia: geocodifica indirizzo cliente',
      hu: 'Garanciaregisztrációk: ügyfélcím geokódolás',
    },
  },
];

// ---------- User key (used in localStorage keys) ----------

export function getUserKey(user: Pick<SessionUser, 'email' | 'portal_role' | 'role'> | null): string {
  if (!user) return 'anon';
  const email = (user.email || 'anon').toLowerCase();
  const role = (user.portal_role || user.role || 'unknown').toString();
  return `${email}::${role}`;
}

// ---------- Storage adapter (localStorage today, Supabase later) ----------

interface ReadStore {
  getReadIds(userKey: string): Set<string>;
  markRead(userKey: string, entryIds: string[]): void;
  subscribe(listener: () => void): () => void;
}

const STORAGE_PREFIX = 'timan.portalChangeLogReads.v1::';
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(l => {
    try { l(); } catch { /* ignore */ }
  });
}

const localReadStore: ReadStore = {
  getReadIds(userKey) {
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
  markRead(userKey, entryIds) {
    if (entryIds.length === 0) return;
    const current = this.getReadIds(userKey);
    let changed = false;
    for (const id of entryIds) {
      if (!current.has(id)) { current.add(id); changed = true; }
    }
    if (!changed) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + userKey, JSON.stringify(Array.from(current)));
    } catch { /* quota/private mode → ignore */ }
    notify();
  },
  subscribe(listener) {
    listeners.add(listener);
    // Cross-tab updates
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith(STORAGE_PREFIX)) listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  },
};

// ---------- Filtering & queries ----------

function isEntryVisibleToUser(
  entry: ChangeLogEntry,
  user: Pick<SessionUser, 'portal_role' | 'role'> | null,
  language: Language,
): boolean {
  if (entry.languages && !entry.languages.includes(language)) return false;
  if (entry.roleVisibility && entry.roleVisibility.length > 0) {
    const role = user?.portal_role || user?.role;
    if (!role || !entry.roleVisibility.includes(String(role))) return false;
  }
  return true;
}

export function getVisibleEntries(
  user: Pick<SessionUser, 'email' | 'portal_role' | 'role'> | null,
  language: Language,
): ChangeLogEntry[] {
  return CHANGELOG_ENTRIES
    .filter(e => isEntryVisibleToUser(e, user, language))
    .slice()
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

// ---------- Relative age ----------

export function relativeAge(iso: string, language: Language): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(diffMs / day);
  const L = (k: Record<Language, string>) => k[language] || k.en;
  if (days <= 0) return L({ da: 'Ny', en: 'New', de: 'Neu', it: 'Nuovo', hu: 'Új' });
  if (days === 1) return L({ da: '1 dag siden', en: '1 day ago', de: 'vor 1 Tag', it: '1 giorno fa', hu: '1 napja' });
  if (days < 7)  return L({
    da: `${days} dage siden`, en: `${days} days ago`, de: `vor ${days} Tagen`,
    it: `${days} giorni fa`, hu: `${days} napja`,
  });
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return L({ da: '1 uge siden', en: '1 week ago', de: 'vor 1 Woche', it: '1 settimana fa', hu: '1 hete' });
  if (weeks < 8)   return L({
    da: `${weeks} uger siden`, en: `${weeks} weeks ago`, de: `vor ${weeks} Wochen`,
    it: `${weeks} settimane fa`, hu: `${weeks} hete`,
  });
  const months = Math.max(1, Math.floor(days / 30));
  return L({
    da: `${months} mdr. siden`, en: `${months} mo. ago`, de: `vor ${months} Mon.`,
    it: `${months} mesi fa`, hu: `${months} hónapja`,
  });
}

// ---------- Hook ----------

export interface UseChangelogResult {
  entries: ChangeLogEntry[];
  readIds: Set<string>;
  isRead: (entryId: string) => boolean;
  unreadCountForArea: (areaId: PortalAreaId) => number;
  hasUnreadForArea: (areaId: PortalAreaId) => boolean;
  markEntryRead: (entryId: string) => void;
  markAreaRead: (areaId: PortalAreaId) => void;
}

export function useChangelog(
  user: Pick<SessionUser, 'email' | 'portal_role' | 'role'> | null,
  language: Language,
): UseChangelogResult {
  const userKey = getUserKey(user);

  const subscribe = useCallback((cb: () => void) => localReadStore.subscribe(cb), []);
  const getSnapshot = useCallback(() => {
    // Compact stable string snapshot so React only re-renders on actual change.
    const ids = Array.from(localReadStore.getReadIds(userKey)).sort();
    return `${userKey}|${ids.join(',')}`;
  }, [userKey]);

  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const readIds = localReadStore.getReadIds(userKey);

  const entries = getVisibleEntries(user, language);

  return {
    entries,
    readIds,
    isRead: (id) => readIds.has(id),
    unreadCountForArea: (areaId) =>
      entries.filter(e => e.areaId === areaId && !readIds.has(e.id)).length,
    hasUnreadForArea: (areaId) =>
      entries.some(e => e.areaId === areaId && !readIds.has(e.id)),
    markEntryRead: (id) => localReadStore.markRead(userKey, [id]),
    markAreaRead: (areaId) => {
      const ids = entries.filter(e => e.areaId === areaId).map(e => e.id);
      localReadStore.markRead(userKey, ids);
    },
  };
}
