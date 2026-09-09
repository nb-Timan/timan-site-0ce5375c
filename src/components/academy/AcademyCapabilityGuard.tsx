import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useEffectivePortalUserState } from '@/lib/viewAsUser';
import { academySandbox } from '@/lib/academySandbox';
import { canAccessAcademy, type AcademyCapability, isAcademyCapabilityUnlocked } from '@/lib/academyCurriculum';

export default function AcademyCapabilityGuard({ capability, children }: { capability: AcademyCapability; children: ReactNode }) {
  const { appUser, loading } = useAppUser();
  const { effectiveUser, resolving } = useEffectivePortalUserState(appUser);

  if (loading || resolving) return null;
  // Training routes remain available so a locked user can complete the work
  // that unlocks the production capability.
  if (academySandbox.isActive()) {
    if (canAccessAcademy(effectiveUser) || (import.meta.env.DEV && !effectiveUser)) return <>{children}</>;
    return <Navigate to="/portal" replace />;
  }
  if (!isAcademyCapabilityUnlocked(effectiveUser, capability, academySandbox.getCompletedCaseIds())) {
    return <Navigate to={`/academy?locked=${encodeURIComponent(capability)}`} replace />;
  }
  return <>{children}</>;
}
