/**
 * Portal change log — Supabase data service (Phase 3).
 *
 * Loads entries from `public.portal_change_log` and caches them in-memory.
 * Falls back to the hardcoded demo entries (CHANGELOG_ENTRIES) when the
 * table is empty or unreachable.
 *
 * Rows are stored mono-lingually in the DB (`language` column). To stay
 * compatible with the existing UI which expects multilingual records, each
 * row is materialised into a `ChangeLogEntry` whose multilingual fields are
 * filled with the same string on every language key. Language fallback to
 * Danish is applied at query time (see `filterByLanguage`).
 */
import { supabase } from './supabase';
import {
  CHANGELOG_ENTRIES,
  ChangeLogEntry,
  ModuleKey,
  ChangelogRole,
} from './portalChangelog';
import { Language } from '@/types/configurator';

const LANG_KEYS: Language[] = ['da', 'en', 'de', 'it', 'hu'];

export interface PortalChangeLogRow {
  id: string;
  module_key: string;
  module_name: string;
  submodule_key: string | null;
  changed_at: string;
  title: string;
  description: string | null;
  role_visibility: string[] | null;
  language: string;
  is_major: boolean;
  is_new_until: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
}

function fanout(text: string | null | undefined): Record<Language, string> {
  const v = text ?? '';
  return LANG_KEYS.reduce((acc, k) => { acc[k] = v; return acc; }, {} as Record<Language, string>);
}

export function rowToEntry(row: PortalChangeLogRow): ChangeLogEntry & { _lang: Language; _rowLang: string } {
  const lang = (LANG_KEYS as string[]).includes(row.language) ? (row.language as Language) : 'da';
  return {
    id: row.id,
    module_key: row.module_key as ModuleKey,
    submodule_key: row.submodule_key || undefined,
    module_name: fanout(row.module_name),
    changed_at: row.changed_at,
    title: fanout(row.title),
    description: row.description ? fanout(row.description) : undefined,
    note: fanout(row.title), // module-page line uses note; reuse title when no separate note column
    role_visibility: (row.role_visibility || ['all']) as ChangelogRole[],
    is_major: !!row.is_major,
    is_new_until: row.is_new_until || undefined,
    _lang: lang,
    _rowLang: row.language,
  };
}

// ---------- In-memory cache ----------

type CacheState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; rows: PortalChangeLogRow[] }
  | { status: 'fallback' };

let cache: CacheState = { status: 'idle' };
const subs = new Set<() => void>();
let snapshotVersion = 0;
let snapshotToken = 'idle';

function bumpSnapshot() {
  snapshotVersion += 1;
  snapshotToken = `${cache.status}#${snapshotVersion}`;
  subs.forEach(cb => { try { cb(); } catch { /* ignore */ } });
}

export function subscribeChangelog(cb: () => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

export function getChangelogSnapshot(): string {
  return snapshotToken;
}

export async function loadChangelogFromSupabase(force = false): Promise<void> {
  if (!force && (cache.status === 'loading' || cache.status === 'ready' || cache.status === 'fallback')) return;
  cache = { status: 'loading' };
  bumpSnapshot();
  try {
    const { data, error } = await supabase
      .from('portal_change_log')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(200);
    if (error || !data || data.length === 0) {
      cache = { status: 'fallback' };
    } else {
      cache = { status: 'ready', rows: data as PortalChangeLogRow[] };
    }
  } catch {
    cache = { status: 'fallback' };
  }
  bumpSnapshot();
}

/** Force a refetch (e.g. after an admin edit). */
export async function refreshChangelog(): Promise<void> {
  await loadChangelogFromSupabase(true);
}

/** Synchronous accessor — returns rows for the UI. Triggers a load when idle. */
export function getEntriesForLanguage(language: Language): ChangeLogEntry[] {
  if (cache.status === 'idle') {
    // Kick off background load — UI will re-render via subscription.
    void loadChangelogFromSupabase();
  }
  if (cache.status === 'ready') {
    const rows = cache.rows.map(rowToEntry);
    return filterByLanguage(rows, language);
  }
  return CHANGELOG_ENTRIES;
}

/** Per-module language fallback: prefer rows in `language`, else Danish. */
function filterByLanguage(
  rows: (ChangeLogEntry & { _rowLang: string })[],
  language: Language,
): ChangeLogEntry[] {
  const byModule = new Map<string, ChangeLogEntry[]>();
  for (const r of rows) {
    const list = byModule.get(r.module_key) || [];
    list.push(r);
    byModule.set(r.module_key, list);
  }
  const out: ChangeLogEntry[] = [];
  for (const [, list] of byModule) {
    const inLang = list.filter(r => (r as any)._rowLang === language);
    const picked = inLang.length > 0 ? inLang : list.filter(r => (r as any)._rowLang === 'da');
    // If no Danish either, fall back to whatever is there so admin sees data.
    out.push(...(picked.length > 0 ? picked : list));
  }
  return out.sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1));
}

// ---------- Admin CRUD helpers ----------

export interface ChangelogDraft {
  id?: string;
  module_key: string;
  module_name: string;
  submodule_key?: string | null;
  title: string;
  description?: string | null;
  changed_at: string;            // ISO
  language: string;              // da/en/...
  is_major: boolean;
  is_new_until?: string | null;  // ISO or null
  role_visibility: string[];
}

export async function adminListChangelog(): Promise<{ rows: PortalChangeLogRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('portal_change_log')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(500);
  if (error) return { rows: [], error: error.message };
  return { rows: (data || []) as PortalChangeLogRow[], error: null };
}

export async function adminCreateChangelog(draft: ChangelogDraft): Promise<{ error: string | null }> {
  const { error } = await supabase.from('portal_change_log').insert({
    module_key: draft.module_key,
    module_name: draft.module_name,
    submodule_key: draft.submodule_key || null,
    title: draft.title,
    description: draft.description || null,
    changed_at: draft.changed_at,
    language: draft.language,
    is_major: draft.is_major,
    is_new_until: draft.is_new_until || null,
    role_visibility: draft.role_visibility,
  });
  if (error) return { error: error.message };
  await refreshChangelog();
  return { error: null };
}

export async function adminUpdateChangelog(id: string, draft: ChangelogDraft): Promise<{ error: string | null }> {
  const { error } = await supabase.from('portal_change_log').update({
    module_key: draft.module_key,
    module_name: draft.module_name,
    submodule_key: draft.submodule_key || null,
    title: draft.title,
    description: draft.description || null,
    changed_at: draft.changed_at,
    language: draft.language,
    is_major: draft.is_major,
    is_new_until: draft.is_new_until || null,
    role_visibility: draft.role_visibility,
  }).eq('id', id);
  if (error) return { error: error.message };
  await refreshChangelog();
  return { error: null };
}

export async function adminDeleteChangelog(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('portal_change_log').delete().eq('id', id);
  if (error) return { error: error.message };
  await refreshChangelog();
  return { error: null };
}
