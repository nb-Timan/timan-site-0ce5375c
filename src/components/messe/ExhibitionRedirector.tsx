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

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[messe] MesseRouteGuard render', { path: location.pathname, redirectTarget });
  }

  if (redirectTarget) {
    if (redirectTarget.startsWith('/portal')) leaveExhibitionMode();
    return <Navigate to={redirectTarget} replace />;
  }
  return <>{children}</>;
}

export default function ExhibitionRedirector() {
  const { appUser } = useAppUser();
  const location = useLocation();
  const navigate = useNavigate();
  const { realUser, appUserIsMesseVariant, isExhibitionPreview } = useMesseMode(appUser, location.pathname);
  const role = derivePortalRole(appUser);
  const isExhibition = isExhibitionRole(role);
  const onMesse = location.pathname.startsWith('/messe');

  useEffect(() => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[messe] ExhibitionRedirector effect', {
        path: location.pathname,
        onMesse,
        appUserIsMesseVariant,
        isExhibitionPreview,
        hasRealUser: !!realUser,
        isExhibition,
      });
    }

    // 1. Messe-variant authenticated users: lock to /messe.
    if (appUserIsMesseVariant && !onMesse) {
      if (location.pathname === '/update-password' || location.pathname === '/reset-password') return;
      navigate('/messe', { replace: true });
      return;
    }

    // 2. Backend/service real user navigated off /messe — clear stale
    //    exhibition flag ONCE (leaveExhibitionMode is now a no-op when the
    //    flag isn't set, so this can't loop).
    if (realUser && !onMesse) {
      leaveExhibitionMode();
      return;
    }

    // 3. Legacy synthetic exhibition session → bounce back to /messe.
    if (!isExhibition || onMesse) return;
    if (location.pathname === '/update-password' || location.pathname === '/reset-password') return;
    navigate('/messe', { replace: true });
  }, [realUser, appUserIsMesseVariant, isExhibitionPreview, isExhibition, onMesse, location.pathname, navigate]);

  return null;
}
