import { Navigate, useLocation } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole, isExhibitionRole } from '@/lib/portalAccess';

/**
 * Wraps protected portal/CRM/backend/service routes. If the active session
 * is the public Timan Messe exhibition demo, redirect back to /messe.
 *
 * Note: this is the FIRST line of defence. The exhibition session has no
 * Supabase auth, so RLS-backed queries fail closed even if a guard is
 * bypassed.
 */
export default function ExhibitionGuard({ children }: { children: React.ReactNode }) {
  const { appUser } = useAppUser();
  const location = useLocation();
  const role = derivePortalRole(appUser);
  if (isExhibitionRole(role)) {
    // Avoid redirect loops if somehow nested under /messe.
    if (location.pathname.startsWith('/messe')) return <>{children}</>;
    return <Navigate to="/messe" replace />;
  }
  return <>{children}</>;
}
