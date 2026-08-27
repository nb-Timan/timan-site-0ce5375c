/**
 * Site/product changelog service.
 *
 * Public portal UI reads only `site_change_public_entries`, which contains
 * user-facing published text. Marketing/Backend administration reads the
 * internal `site_change_entries` table.
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
const PAGE_SIZE = 1000;

export type SiteChangeStatus = 'new' | 'draft' | 'published' | 'archived';
export type SiteChangeRecommendation = 'publish' | 'maybe' | 'internal';

export interface SiteChangeEntryRow {
  id: string;
  source: string;
  source_ref: string | null;
  implemented_at: string;
  title_internal: string;
  description_internal: string | null;
  technical_description: string | null;
  title_public: string | null;
  description_public: string | null;
  module: string;
  change_type: string;
  affected_roles: string[];
  user_impact_score: number;
  technical_impact_score: number;
  publish_recommendation: SiteChangeRecommendation;
  is_important: boolean;
  status: SiteChangeStatus;
  published_at: string | null;
  archived_at: string | null;
  reviewed_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteChangePublicRow {
  id: string;
  published_at: string;
  implemented_at: string;
  title: string;
  description: string | null;
  module: string;
  change_type: string;
  affected_roles: string[];
  is_important: boolean;
  source_ref: string | null;
  updated_at: string;
}

export interface ChangelogDraft {
  id?: string;
  source: string;
  source_ref?: string | null;
  implemented_at: string;
  title_internal: string;
  description_internal?: string | null;
  technical_description?: string | null;
  title_public?: string | null;
  description_public?: string | null;
  module: string;
  change_type: string;
  affected_roles: string[];
  user_impact_score: number;
  technical_impact_score: number;
  publish_recommendation: SiteChangeRecommendation;
  is_important: boolean;
  status: SiteChangeStatus;
  published_at?: string | null;
  archived_at?: string | null;
  reviewed_at?: string | null;
}

export interface ChangelogListOptions {
  page?: number;
  pageSize?: number;
  status?: SiteChangeStatus | 'all';
  recommendation?: SiteChangeRecommendation | 'all';
  module?: string;
  role?: string;
  changeType?: string;
  minUserImpact?: number;
  search?: string;
}

function fanout(text: string | null | undefined): Record<Language, string> {
  const v = text ?? '';
  return LANG_KEYS.reduce((acc, k) => { acc[k] = v; return acc; }, {} as Record<Language, string>);
}

function moduleName(module: string): string {
  const labels: Record<string, string> = {
    crm: 'CRM',
    leads: 'Leads',
    dealer_data: 'Forhandlerdata',
    dealer_portal: 'Forhandlerportal',
    service: 'Service & Teknik',
    messe: 'Messe',
    marketing: 'Marketing',
    map: 'Kort',
    warranty: 'Garantiregistrering',
    claims: 'Claims',
    tsb: 'TSB',
    users: 'Brugere',
    budget: 'Budget',
    quotes: 'Tilbud',
    orders: 'Ordrer',
    backend: 'Backend',
    misc: 'Formularer',
    configurator: 'Konfigurator',
    partner_map: 'Partnerkort',
  };
  return labels[module] || module;
}

function moduleToKey(module: string): ModuleKey {
  const map: Record<string, ModuleKey> = {
    map: 'partner_map',
    partner_map: 'misc',
    dealer_portal: 'dealer_data',
    leads: 'crm',
    budget: 'crm',
    quotes: 'crm',
    orders: 'crm',
    users: 'backend',
    marketing: 'backend',
    tsb: 'service',
  };
  return map[module] || (module as ModuleKey);
}

function normalizeRoleVisibility(roles: string[]): ChangelogRole[] {
  const out = new Set<ChangelogRole>();
  for (const role of roles) {
    if (role === 'all') out.add('all');
    if (role === 'timan_backend') out.add('timan_backend').add('backend').add('admin');
    if (role === 'admin') out.add('backend').add('admin');
    if (role === 'timan_seller') out.add('timan_seller').add('sales');
    if (role === 'sales') out.add('sales');
    if (role === 'timan_service') out.add('timan_service').add('service');
    if (role === 'service') out.add('service');
    if (role === 'timan_importer') out.add('timan_importer');
    if (role === 'timan_dealer') out.add('timan_dealer');
    if (role === 'timan_service_partner') out.add('timan_service_partner');
    if (role === 'dealer_customer') out.add('dealer_customer');
    if (role === 'dealer_user') out.add('dealer_user');
    if (role === 'private_end_user') out.add('private_end_user');
    if (role === 'exhibition_user') out.add('exhibition_user').add('timan_messe');
    if (role === 'timan_messe') out.add('timan_messe').add('exhibition_user');
    if (
      role === 'dealer' ||
      role === 'timan_dealer' ||
      role === 'dealer_user' ||
      role === 'timan_importer' ||
      role === 'timan_service_partner' ||
      role === 'dealer_customer'
    ) out.add('dealer');
  }
  return out.size > 0 ? Array.from(out) : ['all'];
}

export function publicRowToEntry(row: SiteChangePublicRow): ChangeLogEntry {
  return {
    id: row.id,
    module_key: moduleToKey(row.module),
    module_name: fanout(moduleName(row.module)),
    changed_at: row.published_at,
    title: fanout(row.title),
    description: row.description ? fanout(row.description) : undefined,
    note: fanout(row.title),
    role_visibility: normalizeRoleVisibility(row.affected_roles || ['all']),
    is_major: !!row.is_important,
  };
}

// ---------- In-memory public cache ----------

type CacheState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; rows: SiteChangePublicRow[] }
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

async function fetchAllPublicRows(): Promise<SiteChangePublicRow[]> {
  const rows: SiteChangePublicRow[] = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('site_change_public_entries')
      .select('*')
      .order('published_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    const batch = (data || []) as SiteChangePublicRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function loadChangelogFromSupabase(force = false): Promise<void> {
  if (!force && (cache.status === 'loading' || cache.status === 'ready' || cache.status === 'fallback')) return;
  cache = { status: 'loading' };
  bumpSnapshot();
  try {
    const rows = await fetchAllPublicRows();
    cache = rows.length > 0 ? { status: 'ready', rows } : { status: 'fallback' };
  } catch {
    cache = { status: 'fallback' };
  }
  bumpSnapshot();
}

export async function refreshChangelog(): Promise<void> {
  await loadChangelogFromSupabase(true);
}

export function getEntriesForLanguage(_language: Language): ChangeLogEntry[] {
  if (cache.status === 'idle') void loadChangelogFromSupabase();
  if (cache.status === 'ready') {
    return cache.rows.map(publicRowToEntry).sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1));
  }
  return CHANGELOG_ENTRIES;
}

// ---------- Admin CRUD helpers ----------

function applyFilters(query: any, options: ChangelogListOptions) {
  let q = query;
  if (options.status && options.status !== 'all') q = q.eq('status', options.status);
  if (options.recommendation && options.recommendation !== 'all') q = q.eq('publish_recommendation', options.recommendation);
  if (options.module && options.module !== 'all') q = q.eq('module', options.module);
  if (options.role && options.role !== 'all') q = q.contains('affected_roles', [options.role]);
  if (options.changeType && options.changeType !== 'all') q = q.eq('change_type', options.changeType);
  if (options.minUserImpact) q = q.gte('user_impact_score', options.minUserImpact);
  if (options.search?.trim()) {
    const s = `%${options.search.trim()}%`;
    q = q.or(`title_internal.ilike.${s},description_internal.ilike.${s},title_public.ilike.${s},description_public.ilike.${s},source_ref.ilike.${s}`);
  }
  return q;
}

export async function adminListChangelog(options: ChangelogListOptions = {}): Promise<{ rows: SiteChangeEntryRow[]; count: number; error: string | null }> {
  const page = Math.max(0, options.page ?? 0);
  const pageSize = Math.min(Math.max(10, options.pageSize ?? 50), 100);
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('site_change_entries')
    .select('*', { count: 'exact' });
  query = applyFilters(query, options)
    .order('implemented_at', { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) return { rows: [], count: 0, error: error.message };
  return { rows: (data || []) as SiteChangeEntryRow[], count: count || 0, error: null };
}

function toPayload(draft: ChangelogDraft) {
  const now = new Date().toISOString();
  const status = draft.status;
  return {
    source: draft.source || 'manual',
    source_ref: draft.source_ref || null,
    implemented_at: draft.implemented_at,
    title_internal: draft.title_internal,
    description_internal: draft.description_internal || null,
    technical_description: draft.technical_description || null,
    title_public: draft.title_public || null,
    description_public: draft.description_public || null,
    module: draft.module,
    change_type: draft.change_type,
    affected_roles: draft.affected_roles?.length ? draft.affected_roles : ['all'],
    user_impact_score: draft.user_impact_score,
    technical_impact_score: draft.technical_impact_score,
    publish_recommendation: draft.publish_recommendation,
    is_important: draft.is_important,
    status,
    published_at: status === 'published' ? (draft.published_at || now) : null,
    archived_at: status === 'archived' ? (draft.archived_at || now) : null,
    reviewed_at: status !== 'new' ? (draft.reviewed_at || now) : null,
  };
}

export async function adminCreateChangelog(draft: ChangelogDraft): Promise<{ row: SiteChangeEntryRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('site_change_entries')
    .insert(toPayload(draft))
    .select('*')
    .maybeSingle();
  if (error) return { row: null, error: error.message };
  await refreshChangelog();
  return { row: data as SiteChangeEntryRow, error: null };
}

export async function adminUpdateChangelog(id: string, draft: ChangelogDraft): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('site_change_entries')
    .update(toPayload(draft))
    .eq('id', id);
  if (error) return { error: error.message };
  await refreshChangelog();
  return { error: null };
}

export async function adminDeleteChangelog(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('site_change_entries').delete().eq('id', id);
  if (error) return { error: error.message };
  await refreshChangelog();
  return { error: null };
}

export async function adminUpdateChangelogStatus(id: string, status: SiteChangeStatus): Promise<{ error: string | null }> {
  const now = new Date().toISOString();
  const patch: Record<string, string | null> = {
    status,
    reviewed_at: status === 'new' ? null : now,
    published_at: status === 'published' ? now : null,
    archived_at: status === 'archived' ? now : null,
  };
  const { error } = await supabase.from('site_change_entries').update(patch).eq('id', id);
  if (error) return { error: error.message };
  await refreshChangelog();
  return { error: null };
}

export function recommendPublication(userImpact: number, technicalImpact: number): SiteChangeRecommendation {
  if (userImpact >= 8) return 'publish';
  if (userImpact <= 2 && technicalImpact <= 5) return 'internal';
  return 'maybe';
}

export function inferModuleFromFiles(files: string[]): string {
  const haystack = files.join('\n').toLowerCase();
  if (haystack.includes('/crm/') || haystack.includes('crm')) return 'crm';
  if (haystack.includes('partnermap') || haystack.includes('partner-map') || haystack.includes('map')) return 'map';
  if (haystack.includes('dealer')) return 'dealer_data';
  if (haystack.includes('messe')) return 'messe';
  if (haystack.includes('tsb')) return 'tsb';
  if (haystack.includes('warranty')) return 'warranty';
  if (haystack.includes('claim')) return 'claims';
  if (haystack.includes('news') || haystack.includes('marketing')) return 'marketing';
  if (haystack.includes('backend')) return 'backend';
  return 'backend';
}
