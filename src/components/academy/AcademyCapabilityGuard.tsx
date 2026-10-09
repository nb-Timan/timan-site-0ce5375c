import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useAcademyAccess } from '@/context/AcademyAccessContext';
import { useEffectivePortalUserState } from '@/lib/viewAsUser';
import { academySandbox } from '@/lib/academySandbox';
import { ACADEMY_CASE_IDS, canAccessAcademy, type AcademyCapability, isAcademyCapabilityGated, isAcademyCapabilityUnlocked } from '@/lib/academyCurriculum';

const TRAINING_CASE_BYPASSES: Partial<Record<AcademyCapability, readonly string[]>> = {
  partner_data: [ACADEMY_CASE_IDS.partnerDataPart1, ACADEMY_CASE_IDS.partnerDataPart2, ACADEMY_CASE_IDS.portalBasics],
  partner_map: [ACADEMY_CASE_IDS.partnerMap, ACADEMY_CASE_IDS.portalBasics],
  configurator: [ACADEMY_CASE_IDS.salesCase1, ACADEMY_CASE_IDS.salesCase3],
  sales_video: [ACADEMY_CASE_IDS.salesCase2],
  technical_service: [ACADEMY_CASE_IDS.serviceCase1],
};

export default function AcademyCapabilityGuard({ capability, children }: { capability: AcademyCapability; children?: ReactNode }) {
  const { appUser, loading } = useAppUser();
  const { effectiveUser, resolving } = useEffectivePortalUserState(appUser);
  const academyAccess = useAcademyAccess();
  const accessUser = academyAccess?.effectiveUser ?? effectiveUser;
  const completionIds = academyAccess?.completionIds ?? academySandbox.getCompletedCaseIds();
  const content = children ?? <Outlet />;

  if (loading || resolving || academyAccess?.resolving) return null;
  if (!isAcademyCapabilityGated(accessUser)) return <>{content}</>;

  // Training routes remain available so a locked user can complete the work
  // that unlocks the production capability.
  if (!canAccessAcademy(accessUser) && !(import.meta.env.DEV && !accessUser)) {
    return <Navigate to="/portal" replace />;
  }
  const activeCase = academySandbox.getActiveCase();
  if (academySandbox.isActive() && activeCase && TRAINING_CASE_BYPASSES[capability]?.includes(activeCase)) {
    return <>{content}</>;
  }
  if (!isAcademyCapabilityUnlocked(accessUser, capability, completionIds)) {
    return <Navigate to={`/academy?locked=${encodeURIComponent(capability)}`} replace />;
  }
  return <>{content}</>;
}
