import type { AppUser } from '@/data/appUsers';
import type { SessionUser } from '@/context/AppUserContext';
import { derivePortalRole, isBackendActor } from '@/lib/portalAccess';

export const ACADEMY_CASE_1_ID = 'sales.case_1_rc1000';
const LOCAL_ACADEMY_ENROLLMENT_KEY = 'timan.academy.local-enrollment.v1';

export type AcademyCapability = 'configurator' | 'crm' | 'demo' | 'quote' | 'order';

type AcademyUser = Pick<AppUser, 'role' | 'partner_type'> & {
  portal_role?: string | null;
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

export function isAcademySandboxEnvironment() { return import.meta.env.DEV; }
export function isAcademyRelevant(user: AcademyUser | null | undefined) {
  const role = user ? derivePortalRole(user) : null;
  return role === 'timan_seller' || role === 'timan_backend' || role === 'timan_service';
}
export function isAcademyCapabilityGated(user: AcademyUser | null | undefined) {
  return Boolean(user?.permissions?.academy_required) || hasLocalAcademyEnrollment();
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
