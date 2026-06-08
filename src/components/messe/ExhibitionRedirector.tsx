import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole, isExhibitionRole } from '@/lib/portalAccess';
import { useMesseMode } from '@/lib/messeMode';
import { leaveExhibitionMode } from '@/lib/exhibitionMode';

/**
 * Route guard for /messe paths.
 *  - Anonymous visitor → redirect to /portal?redirect=/messe (login required).
 *  - Backend user in non-exhibition preview → redirect to their portal home.
 *  - Regular (non-Messe-variant) logged-in user → redirect to /portal.
 *  - Messe-variant user or backend exhibition preview → render Messe page.
 */
export function MesseRouteGuard({ children }: { children: ReactNode }) {
  const { appUser } = useAppUser();
  const location = useLocation();
  const { redirectTarget } = useMesseMode(appUser, location.pathname);

  if (redirectTarget) {
    if (redirectTarget.startsWith('/portal')) leaveExhibitionMode();
    return <Navigate to={redirectTarget} replace />;
  }
  return <>{children}</>;
}

/**
 * Global redirector mounted in App.
 *   1. Messe-variant users are locked to /messe — bounce them back from
 *      every other portal route.
 *   2. Public exhibition_user (legacy) → trapped on /messe.
 *   3. Backend/service users with a stale exhibition flag outside /messe
 *      → clear the flag.
 */
export default function ExhibitionRedirector() {
  const { appUser } = useAppUser();
  const location = useLocation();
  const navigate = useNavigate();
  const { realUser, appUserIsMesseVariant, redirectTarget } = useMesseMode(appUser, location.pathname);
  const role = derivePortalRole(appUser);
  const isExhibition = isExhibitionRole(role);

  useEffect(() => {
    // Messe-variant authenticated users: lock to /messe.
    if (appUserIsMesseVariant && !location.pathname.startsWith('/messe')) {
      if (location.pathname === '/update-password' || location.pathname === '/reset-password') return;
      navigate('/messe', { replace: true });
      return;
    }

    // Real backend/service user → ensure no stale exhibition flag lingers
    // when they navigate away from /messe.
    if (realUser) {
      if (!location.pathname.startsWith('/messe')) {
        leaveExhibitionMode();
      } else if (redirectTarget) {
        navigate(redirectTarget, { replace: true });
      }
      return;
    }

    // Legacy synthetic exhibition session → bounce back to /messe.
    if (!isExhibition) return;
    const p = location.pathname;
    if (p.startsWith('/messe')) return;
    if (p === '/update-password' || p === '/reset-password') return;
    navigate('/messe', { replace: true });
  }, [realUser, appUserIsMesseVariant, redirectTarget, isExhibition, location.pathname, navigate]);

  return null;
}
