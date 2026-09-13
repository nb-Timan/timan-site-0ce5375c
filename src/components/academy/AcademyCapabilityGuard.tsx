import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useEffectivePortalUserState } from '@/lib/viewAsUser';
import { ACADEMY_CASE_1, academySandbox } from '@/lib/academySandbox';
import { canAccessAcademy, type AcademyCapability, isAcademyCapabilityUnlocked } from '@/lib/academyCurriculum';

export default function AcademyCapabilityGuard({ capability, children }: { capability: AcademyCapability; children: ReactNode }) {
  const { appUser, loading } = useAppUser();
  const { effectiveUser, resolving } = useEffectivePortalUserState(appUser);

  if (loading || resolving) return null;
  // Academy completion gates apply only while the local training sandbox is active.
  // Normal portal routes must retain their ordinary role/module access.
  if (!academySandbox.isActive()) return <>{children}</>;

  // Training routes remain available so a locked user can complete the work
  // that unlocks the production capability.
  if (!canAccessAcademy(effectiveUser) && !(import.meta.env.DEV && !effectiveUser)) {
    return <Navigate to="/portal" replace />;
  }
  // Case 1 is the training path that unlocks the real Configurator. It must
  // remain reachable while the normal capability stays locked.
  if (capability === 'configurator' && academySandbox.getActiveCase() === ACADEMY_CASE_1) {
    return <>{children}</>;
  }
  if (!isAcademyCapabilityUnlocked(effectiveUser, capability, academySandbox.getCompletedCaseIds())) {
    return <Navigate to={`/academy?locked=${encodeURIComponent(capability)}`} replace />;
  }
  return <>{children}</>;
}
