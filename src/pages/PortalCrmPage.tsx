import { Navigate } from 'react-router-dom';
import { useAcademyAccess } from '@/context/AcademyAccessContext';

// Academy users enter the first CRM capability they have earned. Everyone
// else keeps the canonical dashboard landing page.
export default function PortalCrmPage() {
  const academyAccess = useAcademyAccess();
  if (academyAccess?.resolving) return null;
  const target = academyAccess && !academyAccess.isUnlocked('crm_complete')
    ? '/portal/crm/leads'
    : '/portal/crm/dashboard';
  return <Navigate to={target} replace />;
}
