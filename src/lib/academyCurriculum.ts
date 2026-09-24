import type { AppUser } from '@/data/appUsers';
import type { SessionUser } from '@/context/AppUserContext';
import type { BackendUser } from '@/lib/backend-users-store';
import { derivePortalRole, getUserModuleAccessOverride, hasModuleAccess, isBackendActor } from '@/lib/portalAccess';

export const ACADEMY_CASE_1_ID = 'sales.case_1_rc1000';
export const ACADEMY_CASE_IDS = {
  partnerDataPart1: 'partnerdata.part_1_profile',
  partnerDataPart2: 'partnerdata.part_2_relations',
  portalBasics: 'portal.basics_5',
  partnerMap: 'portal.partner_map',
  salesCase1: ACADEMY_CASE_1_ID,
  salesCase2: 'sales.case_2_video_3330',
  crmPart1: 'crm.part_1',
  crmPart2: 'crm.part_2',
} as const;

export type AcademyCurriculumCaseId = typeof ACADEMY_CASE_IDS[keyof typeof ACADEMY_CASE_IDS];
export type AcademyCaseState = 'locked' | 'ready' | 'active' | 'completed';

export type AcademyTrack = 'basic' | 'sales' | 'service';
export const ACADEMY_TRACK_PERMISSIONS = ['academy_track_sales', 'academy_track_service'] as const;
export type AcademyTrackPermission = typeof ACADEMY_TRACK_PERMISSIONS[number];
// The existing Academy curriculum was Sales. Missing keys retain that access;
// the new Service track is opt-in, including for existing service users.
export const ACADEMY_TRACK_DEFAULTS = { academy_track_sales: true, academy_track_service: false } as const;
export const ACADEMY_CASE_TRACK: Record<AcademyCurriculumCaseId, AcademyTrack> = {
  [ACADEMY_CASE_IDS.partnerDataPart1]: 'basic',
  [ACADEMY_CASE_IDS.partnerDataPart2]: 'basic',
  [ACADEMY_CASE_IDS.portalBasics]: 'basic',
  [ACADEMY_CASE_IDS.partnerMap]: 'basic',
  [ACADEMY_CASE_IDS.salesCase1]: 'sales',
  [ACADEMY_CASE_IDS.salesCase2]: 'sales',
  [ACADEMY_CASE_IDS.crmPart1]: 'sales',
  [ACADEMY_CASE_IDS.crmPart2]: 'sales',
};

export function getAcademyTracks(user: AcademyUser | null | undefined): AcademyTrack[] {
  if (!canAccessAcademy(user)) return [];
  return [
    'basic',
    ...((user?.permissions?.academy_track_sales ?? ACADEMY_TRACK_DEFAULTS.academy_track_sales) ? ['sales' as const] : []),
    ...((user?.permissions?.academy_track_service ?? ACADEMY_TRACK_DEFAULTS.academy_track_service) ? ['service' as const] : []),
  ];
}

export function getAssignedAcademyCurriculum(user: AcademyUser | null | undefined) {
  const tracks = getAcademyTracks(user);
  return ACADEMY_CURRICULUM_ORDER.filter((id) => tracks.includes(ACADEMY_CASE_TRACK[id]));
}

export function canAccessAcademyCase(user: AcademyUser | null | undefined, caseId: string) {
  return getAssignedAcademyCurriculum(user).includes(caseId as AcademyCurriculumCaseId);
}

export function getAcademyAwardTargets(user: AcademyUser | null | undefined) {
  return getAcademyTracks(user).includes('sales') ? ['bronze', 'silver', 'gold'] as const : ['gold'] as const;
}

/** Shared training routes must enforce track access before mounting their pages. */
export function getAcademyRouteTrack(pathname: string, search: string, activeCase?: string | null): AcademyTrack | null {
  const params = new URLSearchParams(search);
  const requestedTrack = params.get('track');
  if (pathname.startsWith('/academy/crm') || pathname.startsWith('/portal/crm')
    || pathname === '/configurator' || pathname === '/messe/konfigurator'
    || pathname === '/portal/videos') return 'sales';
  if (requestedTrack && ['basic', 'sales', 'service'].includes(requestedTrack)) return requestedTrack as AcademyTrack;
  if (pathname === '/academy') return null;
  if (activeCase) return ACADEMY_CASE_TRACK[activeCase as AcademyCurriculumCaseId] ?? null;
  return null;
}

export const ACADEMY_CURRICULUM_ORDER: readonly AcademyCurriculumCaseId[] = [
  ACADEMY_CASE_IDS.partnerDataPart1,
  ACADEMY_CASE_IDS.partnerDataPart2,
  ACADEMY_CASE_IDS.portalBasics,
  ACADEMY_CASE_IDS.partnerMap,
  ACADEMY_CASE_IDS.salesCase1,
  ACADEMY_CASE_IDS.salesCase2,
  ACADEMY_CASE_IDS.crmPart1,
  ACADEMY_CASE_IDS.crmPart2,
];

/**
 * A case is available only when every earlier curriculum step is complete.
 * Completed historical cases remain completed, but never skip prerequisites
 * for the next incomplete case.
 */
export function getAcademyCaseState(
  caseId: AcademyCurriculumCaseId,
  completedCaseIds: Iterable<string>,
  startedCaseIds: Iterable<string> = [],
  curriculumAvailable = true,
  curriculum: readonly AcademyCurriculumCaseId[] = ACADEMY_CURRICULUM_ORDER,
): AcademyCaseState {
  if (!curriculum.includes(caseId)) return 'locked';
  const completed = new Set(completedCaseIds);
  if (completed.has(caseId)) return 'completed';
  if (!curriculumAvailable) return 'locked';

  const index = curriculum.indexOf(caseId);
  const prerequisitesComplete = index >= 0
    && curriculum.slice(0, index).every((id) => completed.has(id));
  if (!prerequisitesComplete) return 'locked';
  return new Set(startedCaseIds).has(caseId) ? 'active' : 'ready';
}

export function canOpenAcademyCase(state: AcademyCaseState) {
  return state !== 'locked';
}
const LOCAL_ACADEMY_ENROLLMENT_KEY = 'timan.academy.local-enrollment.v1';

export type AcademyCapability = 'configurator' | 'crm' | 'demo' | 'quote' | 'order';

export type AcademyUser = Pick<AppUser, 'role' | 'partner_type'> & {
  portal_role?: string | null;
  allowed_modules?: string[] | null;
  module_access?: string[] | null;
  permissions?: Record<string, boolean> | null;
};

export function activateLocalAcademyEnrollment() {
  if (import.meta.env.DEV) localStorage.setItem(LOCAL_ACADEMY_ENROLLMENT_KEY, 'academy-local-sales-user');
}

export function hasLocalAcademyEnrollment() {
  return import.meta.env.DEV && localStorage.getItem(LOCAL_ACADEMY_ENROLLMENT_KEY) === 'academy-local-sales-user';
}

export function clearLocalAcademyEnrollment() {
  if (import.meta.env.DEV) localStorage.removeItem(LOCAL_ACADEMY_ENROLLMENT_KEY);
}

export function getLocalAcademyUser(): SessionUser {
  return {
    id: 'academy-local-sales-user', email: 'academy.sales@localhost', display_name: 'Academy Sales',
    role: 'timan_saelger', approved: true, is_active: true, start_step: 1, max_step: 4,
    can_view_prices: true, can_submit_order: false, can_edit_discount: false, can_switch_customer_mode: false,
    portal_role: 'timan_seller', allowed_modules: ['academy', 'salg_marketing', 'byg_din_timan', 'timan_crm'],
    module_access: ['academy', 'salg_marketing', 'byg_din_timan', 'timan_crm'],
    permissions: { can_save_configurator_as_lead: true, academy_required: true },
  };
}

/**
 * Local-only CRM form option. Academy never reads or writes the real user
 * directory, but the ordinary CRM form still needs a selected seller.
 */
export function getLocalAcademyBackendUser(): BackendUser {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'academy-local-sales-user', initials: 'AS', name: 'Academy Sales', email: 'academy.sales@localhost',
    phone: null, company: 'Timan Academy', country: 'DK', postal_code: null, language: 'da', dealer_number: null,
    company_dealer: null, seller_initials: null, seller_email: null, notes: 'Local Academy training identity.',
    role: 'timan_seller', status: 'active', approved: true, is_active: true,
    allowed_areas: [], allowed_modules: ['academy', 'salg_marketing', 'byg_din_timan', 'timan_crm'],
    backend_modules: [], organization_access_role: null,
    perms: {
      can_create_claims: false, can_approve_claims: false, can_create_tsb: false, can_manage_users: false,
      can_manage_payment_terms: false, can_apply_extra_dealer_discount: false, can_save_configurator_as_lead: true,
      marketing_videos_manage: false, marketing_configurator_manage: false, news_manage: false,
      can_view_prices: true, can_submit_order: false,
    },
    account_owner_user_id: null, account_owner_name: null, account_owner_initials: null, account_owner_email: null,
    last_login_at: null, quick_actions: null, portal_variant: 'standard', created_at: now, updated_at: now,
  };
}

/** Academy is an explicit per-user module, never an implicit role benefit. */
export function hasAcademyModuleAccess(user: AcademyUser | null | undefined) {
  return hasModuleAccess(derivePortalRole(user), 'academy', getUserModuleAccessOverride(user));
}

/** Academy is visible and reachable only when the selected user has the explicit module. */
export function canAccessAcademy(user: AcademyUser | null | undefined) {
  return hasAcademyModuleAccess(user);
}
export function isAcademyCapabilityGated(user: AcademyUser | null | undefined) {
  return hasAcademyModuleAccess(user);
}
export function getAcademyProgress(user: AcademyUser | null | undefined, completedCaseIds: Iterable<string>) {
  const curriculum = getAssignedAcademyCurriculum(user);
  const completed = new Set(completedCaseIds);
  const completedCount = curriculum.filter((id) => completed.has(id)).length;
  return { completedCount, total: curriculum.length, percentage: curriculum.length ? completedCount / curriculum.length * 100 : 0 };
}
export function getAcademyCapabilityProgress(capability: AcademyCapability, completedCaseIds: Iterable<string>) {
  const completed = new Set(completedCaseIds);
  const required = capability === 'configurator' ? [ACADEMY_CASE_1_ID] : ['future-academy-case'];
  return { completedCount: required.filter((id) => completed.has(id)).length, total: required.length };
}
export function isAcademyCapabilityUnlocked(user: AcademyUser | null | undefined, capability: AcademyCapability, completedCaseIds: Iterable<string>) {
  if (isAcademyCapabilityGated(user) && !getAcademyTracks(user).includes('sales')) return false;
  if (!isAcademyCapabilityGated(user) || (Boolean(user?.permissions?.academy_bypass) && isBackendActor(user))) return true;
  const progress = getAcademyCapabilityProgress(capability, completedCaseIds);
  return progress.completedCount === progress.total;
}
