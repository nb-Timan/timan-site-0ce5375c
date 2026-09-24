import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useEffectivePortalUserState } from '@/lib/viewAsUser';
import { academySandbox } from '@/lib/academySandbox';
import { canAccessAcademy, getAcademyRouteTrack, getAcademyTracks, getLocalAcademyUser } from '@/lib/academyCurriculum';

export default function AcademyTrackGuard({ children }: { children: ReactNode }) {
  const { appUser, loading } = useAppUser();
  const { effectiveUser, resolving } = useEffectivePortalUserState(appUser);
  const { pathname, search } = useLocation();
  const training = pathname.startsWith('/academy') || new URLSearchParams(search).get('academy_mode') === 'true' || academySandbox.isActive();
  const user = effectiveUser ?? (!appUser && import.meta.env.DEV ? getLocalAcademyUser() : null);
  const tracks = getAcademyTracks(user);
  const activeCase = academySandbox.getActiveCase();
  const track = getAcademyRouteTrack(pathname, search, activeCase);
  const allowed = canAccessAcademy(user);
  const activeTrack = activeCase ? getAcademyRouteTrack('', '', activeCase) : null;
  const activeTrackAllowed = !activeTrack || tracks.includes(activeTrack);

  useEffect(() => {
    if (loading || resolving || !training) return;
    if (!allowed) academySandbox.leaveSession();
    else if (pathname === '/academy' && activeCase) {
      if (!activeTrackAllowed) academySandbox.clearActiveCase(activeCase);
    }
  }, [loading, resolving, training, allowed, pathname, activeCase, activeTrackAllowed]);

  if (!training) return <>{children}</>;
  if (loading || resolving) return null;
  if (!allowed) return <Navigate to="/portal" replace />;
  if (track && !tracks.includes(track)) return <Navigate to="/academy?locked=track" replace />;
  return <>{children}</>;
}
