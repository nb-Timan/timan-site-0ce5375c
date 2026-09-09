import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { canAccessAcademy } from '@/lib/academyCurriculum';
import { useEffectivePortalUserState } from '@/lib/viewAsUser';

function isStandaloneLocalAcademy(user: unknown) {
  return import.meta.env.DEV && !user;
}

/** Keeps Academy opt-in and evaluates it against the selected View-as user. */
export default function AcademyAccessGuard({ children }: { children: ReactNode }) {
  const { appUser, loading } = useAppUser();
  const { effectiveUser, resolving } = useEffectivePortalUserState(appUser);

  if (loading || resolving) return null;
  if (canAccessAcademy(effectiveUser) || isStandaloneLocalAcademy(effectiveUser)) return <>{children}</>;
  return <Navigate to="/portal" replace />;
}
