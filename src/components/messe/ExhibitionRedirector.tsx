import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole, isExhibitionRole } from '@/lib/portalAccess';

/**
 * Global redirector: if the current session is the public Messe / exhibition
 * demo, force the user back to /messe whenever they hit any non-/messe path.
 *
 * Mounted once inside <BrowserRouter>. Complements <ExhibitionGuard> on the
 * portal landing route — this also covers /configurator and any future route.
 */
export default function ExhibitionRedirector() {
  const { appUser } = useAppUser();
  const location = useLocation();
  const navigate = useNavigate();
  const role = derivePortalRole(appUser);
  const isExhibition = isExhibitionRole(role);

  useEffect(() => {
    if (!isExhibition) return;
    const p = location.pathname;
    if (p.startsWith('/messe')) return;
    if (p === '/update-password' || p === '/reset-password') return;
    navigate('/messe', { replace: true });
  }, [isExhibition, location.pathname, navigate]);

  return null;
}
