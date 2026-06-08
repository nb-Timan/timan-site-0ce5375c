import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole, isExhibitionRole } from '@/lib/portalAccess';
import { useMesseMode } from '@/lib/messeMode';
import { leaveExhibitionMode } from '@/lib/exhibitionMode';

/**
 * Route guard for /messe paths. If a real backend/service user has a
 * non-exhibition preview active, leave /messe and route them home.
 * If a public visitor with no real user → render the public Messe page.
 */
export function MesseRouteGuard({ children }: { children: ReactNode }) {
  const { appUser } = useAppUser();
  const { realUser, isExhibitionPreview, redirectTarget } = useMesseMode(
    appUser,
    typeof window !== 'undefined' ? window.location.pathname : '/messe',
  );

  if (realUser && !isExhibitionPreview && redirectTarget) {
    leaveExhibitionMode();
    return <Navigate to={redirectTarget} replace />;
  }
  return <>{children}</>;
}

/**
 * Global redirector. Two responsibilities only:
 *   1. Public exhibition_user (no real auth) → trapped on /messe.
 *   2. Real backend/service user with a stale exhibition flag outside
 *      /messe → clear the flag (no navigation, they may freely roam).
 *
 * The /messe → portal redirect for real users is handled by MesseRouteGuard.
 */
export default function ExhibitionRedirector() {
  const { appUser } = useAppUser();
  const location = useLocation();
  const navigate = useNavigate();
  const { realUser, redirectTarget } = useMesseMode(appUser, location.pathname);
  const role = derivePortalRole(appUser);
  const isExhibition = isExhibitionRole(role);

  useEffect(() => {
    // Real backend/service user → ensure no stale exhibition flag lingers
    // when they navigate away from /messe.
    if (realUser) {
      if (!location.pathname.startsWith('/messe')) {
        leaveExhibitionMode();
      } else if (redirectTarget) {
        // Belt-and-braces — MesseRouteGuard already handles this synchronously.
        navigate(redirectTarget, { replace: true });
      }
      return;
    }

    // Public exhibition session → bounce back to /messe.
    if (!isExhibition) return;
    const p = location.pathname;
    if (p.startsWith('/messe')) return;
    if (p === '/update-password' || p === '/reset-password') return;
    navigate('/messe', { replace: true });
  }, [realUser, redirectTarget, isExhibition, location.pathname, navigate]);

  return null;
}
