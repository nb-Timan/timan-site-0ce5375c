import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { academySandbox } from '@/lib/academySandbox';
import { type AcademyCapability, isAcademyCapabilityUnlocked } from '@/lib/academyCurriculum';

export default function AcademyCapabilityGuard({ capability, children }: { capability: AcademyCapability; children: ReactNode }) {
  const { appUser, loading } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser);

  if (loading) return null;
  // Training routes remain available so a locked user can complete the work
  // that unlocks the production capability.
  if (academySandbox.isActive()) return <>{children}</>;
  if (!isAcademyCapabilityUnlocked(effectiveUser, capability, academySandbox.getCompletedCaseIds())) {
    return <Navigate to={`/academy?locked=${encodeURIComponent(capability)}`} replace />;
  }
  return <>{children}</>;
}
