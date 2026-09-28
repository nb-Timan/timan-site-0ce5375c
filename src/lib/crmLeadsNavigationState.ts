import type { CrmLeadOwnerFilter } from '@/lib/crmLeadOwnerFilter';

export type CrmLeadsTab = 'open' | 'won' | 'closed' | 'all';
export type CrmLeadsSort = 'default' | 'title_asc' | 'title_desc' | 'date_desc' | 'date_asc' | 'prob_desc' | 'prob_asc';
export type CrmLeadsType = 'open' | 'demo' | 'won' | 'lost';
export type CrmLeadsFollowupFilter = 'overdue' | 'soon' | 'later';

export interface CrmLeadsNavigationState {
  tab: CrmLeadsTab;
  followupFilter: CrmLeadsFollowupFilter | null;
  q: string;
  typeFilter: CrmLeadsType | '';
  machineFilter: string;
  equipmentFilter: string;
  ownerFilter: CrmLeadOwnerFilter;
  stage: string;
  sort: CrmLeadsSort;
  page: number;
}

interface NavigationOptions {
  isAdmin: boolean;
}

interface SerializeOptions extends NavigationOptions {
  clearDealer?: boolean;
}

const TAB_VALUES = new Set<CrmLeadsTab>(['open', 'won', 'closed', 'all']);
const SORT_VALUES = new Set<CrmLeadsSort>(['default', 'title_asc', 'title_desc', 'date_desc', 'date_asc', 'prob_desc', 'prob_asc']);
const TYPE_VALUES = new Set<CrmLeadsType | ''>(['', 'open', 'demo', 'won', 'lost']);
const FOLLOWUP_VALUES = new Set<CrmLeadsFollowupFilter>(['overdue', 'soon', 'later']);
const STATIC_OWNER_VALUES = new Set<CrmLeadOwnerFilter>([
  '',
  'other_timan_sellers',
  'partner_created',
  'unassigned_timan_seller',
]);

const NAVIGATION_PARAM_KEYS = [
  'view',
  'followup',
  'q',
  'type',
  'machine',
  'equipment',
  'owner',
  'status',
  'sort',
  'page',
] as const;

const SCROLL_STATE_KEY = 'timanCrmLeadsScrollY';
const RETURN_TO_STATE_KEY = 'timanCrmLeadsReturnTo';

function enumValue<T extends string>(value: string | null, allowed: Set<T>, fallback: T): T {
  return value !== null && allowed.has(value as T) ? value as T : fallback;
}

function ownerValue(value: string | null, isAdmin: boolean): CrmLeadOwnerFilter {
  if (!isAdmin || !value) return '';
  if (STATIC_OWNER_VALUES.has(value as CrmLeadOwnerFilter)) return value as CrmLeadOwnerFilter;
  return value.startsWith('seller:') && value.length > 'seller:'.length
    ? value as CrmLeadOwnerFilter
    : '';
}

function pageValue(value: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed - 1 : 0;
}

export function parseCrmLeadsNavigationState(
  params: URLSearchParams,
  { isAdmin }: NavigationOptions,
): CrmLeadsNavigationState {
  const dealer = params.get('dealer')?.trim() || '';
  const requestedFollowup = params.get('followup');
  const followupFilter = requestedFollowup && FOLLOWUP_VALUES.has(requestedFollowup as CrmLeadsFollowupFilter)
    ? requestedFollowup as CrmLeadsFollowupFilter
    : null;
  const defaultTab: CrmLeadsTab = dealer ? 'all' : 'open';
  const requestedTab = enumValue(params.get('view'), TAB_VALUES, defaultTab);

  return {
    tab: followupFilter ? 'open' : requestedTab,
    followupFilter,
    q: params.has('q') ? params.get('q') || '' : dealer,
    typeFilter: enumValue(params.get('type'), TYPE_VALUES, ''),
    machineFilter: params.get('machine') || '',
    equipmentFilter: params.get('equipment') || '',
    ownerFilter: ownerValue(params.get('owner'), isAdmin),
    stage: params.get('status') || '',
    sort: enumValue(params.get('sort'), SORT_VALUES, 'default'),
    page: pageValue(params.get('page')),
  };
}

function setWhen(params: URLSearchParams, key: string, value: string, include = value.length > 0): void {
  if (include) params.set(key, value);
}

export function serializeCrmLeadsNavigationState(
  currentParams: URLSearchParams,
  state: CrmLeadsNavigationState,
  { isAdmin, clearDealer = false }: SerializeOptions,
): URLSearchParams {
  const params = new URLSearchParams(currentParams);
  NAVIGATION_PARAM_KEYS.forEach((key) => params.delete(key));
  if (clearDealer) params.delete('dealer');

  const dealer = params.get('dealer')?.trim() || '';
  const defaultTab: CrmLeadsTab = dealer ? 'all' : 'open';
  setWhen(params, 'view', state.tab, state.tab !== defaultTab && !state.followupFilter);
  setWhen(params, 'followup', state.followupFilter || '');
  setWhen(params, 'q', state.q, state.q !== dealer);
  setWhen(params, 'type', state.typeFilter);
  setWhen(params, 'machine', state.machineFilter);
  setWhen(params, 'equipment', state.equipmentFilter);
  setWhen(params, 'owner', state.ownerFilter, isAdmin && state.ownerFilter.length > 0);
  setWhen(params, 'status', state.stage);
  setWhen(params, 'sort', state.sort, state.sort !== 'default');
  setWhen(params, 'page', String(state.page + 1), state.page > 0);
  return params;
}

export function defaultCrmLeadsNavigationState(tab: CrmLeadsTab = 'all'): CrmLeadsNavigationState {
  return {
    tab,
    followupFilter: null,
    q: '',
    typeFilter: '',
    machineFilter: '',
    equipmentFilter: '',
    ownerFilter: '',
    stage: '',
    sort: 'default',
    page: 0,
  };
}

export function isCrmLeadsListPath(pathname: string): boolean {
  return pathname === '/portal/crm/leads' || pathname === '/academy/crm/leads';
}

export function createCrmLeadsDetailNavigationState(pathname: string, search: string): Record<string, string> {
  if (!isCrmLeadsListPath(pathname)) return {};
  return { [RETURN_TO_STATE_KEY]: `${pathname}${search}` };
}

export function readCrmLeadsReturnTarget(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const value = (state as Record<string, unknown>)[RETURN_TO_STATE_KEY];
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  const parsed = new URL(value, 'https://portal.timan.invalid');
  if (parsed.origin !== 'https://portal.timan.invalid' || !isCrmLeadsListPath(parsed.pathname)) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function clearCrmLeadsNavigationParams(search: string): string {
  const params = new URLSearchParams(search);
  NAVIGATION_PARAM_KEYS.forEach((key) => params.delete(key));
  params.delete('dealer');
  const next = params.toString();
  return next ? `?${next}` : '';
}

export function clearCurrentCrmLeadsHistoryState(): boolean {
  if (typeof window === 'undefined' || !isCrmLeadsListPath(window.location.pathname)) return false;
  const search = clearCrmLeadsNavigationParams(window.location.search);
  const nextHistoryState = window.history.state && typeof window.history.state === 'object'
    ? { ...window.history.state }
    : {};
  delete nextHistoryState[SCROLL_STATE_KEY];
  window.history.replaceState(
    nextHistoryState,
    '',
    `${window.location.pathname}${search}${window.location.hash}`,
  );
  return true;
}

export function rememberCurrentCrmLeadsScrollPosition(scrollY?: number): void {
  if (typeof window === 'undefined') return;
  const nextScrollY = scrollY ?? window.scrollY ?? 0;
  const currentState = window.history.state && typeof window.history.state === 'object'
    ? window.history.state
    : {};
  window.history.replaceState(
    { ...currentState, [SCROLL_STATE_KEY]: Math.max(0, nextScrollY) },
    '',
  );
}

export function readCurrentCrmLeadsScrollPosition(): number | null {
  if (typeof window === 'undefined') return null;
  const value = window.history.state?.[SCROLL_STATE_KEY];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
