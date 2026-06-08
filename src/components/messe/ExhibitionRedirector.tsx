import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole, isExhibitionRole } from '@/lib/portalAccess';
import { useCachedRealBackendUser } from '@/lib/cachedRealUser';
import { getActiveMode } from '@/lib/activeMode';
import { isExhibitionActive, leaveExhibitionMode } from '@/lib/exhibitionMode';

/**
 * Global redirector for the public Timan Messe / exhibition session.
 *
 * - Public visitors on the exhibition session are bounced back to /messe
 *   whenever they hit any non-/messe path.
 * - A REAL authenticated Timan Backend / Timan Service user is NEVER
 *   trapped here — they may freely navigate to /portal/backend etc. If
 *   they land here with a stale exhibition flag, we clear it.
 */
export default function ExhibitionRedirector() {
  const { appUser } = useAppUser();
  const realUser = useCachedRealBackendUser();
  const location = useLocation();
  const navigate = useNavigate();
  const role = derivePortalRole(appUser);
  const isExhibition = isExhibitionRole(role);

  useEffect(() => {
    const exhibitionActive = isExhibitionActive();
    const activeMode = realUser?.email ? getActiveMode(realUser.email) : null;

    // DEV log — temporary, helps diagnose stuck exhibition issues.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[ExhibitionRedirector]', {
        path: location.pathname,
        realUserExists: !!realUser,
        realPortalRole: realUser?.portal_role ?? null,
        exhibitionActive,
        activeMode,
        derivedRole: role,
        isExhibition,
      });
    }

    const onMesse = location.pathname.startsWith('/messe');

    // Real backend/service user
    if (realUser) {
      // If on /messe but active preview is NOT exhibition_user → leave /messe
      // and route to the correct portal for the selected mode.
      if (onMesse) {
        const isExhibitionPreview = activeMode === 'role:exhibition_user';
        if (!isExhibitionPreview) {
          if (exhibitionActive) leaveExhibitionMode();
          const dest = activeMode === 'backend' ? '/portal/backend' : '/portal';
          navigate(dest, { replace: true });
        }
        return;
      }
      // Outside /messe: clear stale exhibition flag if it lingers.
      if (exhibitionActive) leaveExhibitionMode();
      return;
    }

    if (!isExhibition) return;
    const p = location.pathname;
    if (p.startsWith('/messe')) return;
    if (p === '/update-password' || p === '/reset-password') return;
    navigate('/messe', { replace: true });
  }, [isExhibition, location.pathname, navigate, realUser, role]);

  return null;
}
