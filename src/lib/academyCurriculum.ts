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
): AcademyCaseState {
  const completed = new Set(completedCaseIds);
  if (completed.has(caseId)) return 'completed';
  if (!curriculumAvailable) return 'locked';

  const index = ACADEMY_CURRICULUM_ORDER.indexOf(caseId);
  const prerequisitesComplete = index >= 0
    && ACADEMY_CURRICULUM_ORDER.slice(0, index).every((id) => completed.has(id));
  if (!prerequisitesComplete) return 'locked';
  return new Set(startedCaseIds).has(caseId) ? 'active' : 'ready';
}

export function canOpenAcademyCase(state: AcademyCaseState) {
  return state !== 'locked';
}
const LOCAL_ACADEMY_ENROLLMENT_KEY = 'timan.academy.local-enrollment.v1';

export type AcademyCapability = 'configurator' | 'crm' | 'demo' | 'quote' | 'order';

type AcademyUser = Pick<AppUser, 'role' | 'partner_type'> & {
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
export function getAcademyProgress(_user: AcademyUser | null | undefined, completedCaseIds: Iterable<string>) {
  const completed = new Set(completedCaseIds).has(ACADEMY_CASE_1_ID) ? 1 : 0;
  return { completedCount: completed, total: 1, percentage: completed * 100 };
}
export function getAcademyCapabilityProgress(capability: AcademyCapability, completedCaseIds: Iterable<string>) {
  const completed = new Set(completedCaseIds);
  const required = capability === 'configurator' ? [ACADEMY_CASE_1_ID] : ['future-academy-case'];
  return { completedCount: required.filter((id) => completed.has(id)).length, total: required.length };
}
export function isAcademyCapabilityUnlocked(user: AcademyUser | null | undefined, capability: AcademyCapability, completedCaseIds: Iterable<string>) {
  if (!isAcademyCapabilityGated(user) || (Boolean(user?.permissions?.academy_bypass) && isBackendActor(user))) return true;
  const progress = getAcademyCapabilityProgress(capability, completedCaseIds);
  return progress.completedCount === progress.total;
}
