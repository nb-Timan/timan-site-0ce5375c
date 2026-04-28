import { Navigate } from 'react-router-dom';

// /portal/crm → /portal/crm/dashboard. Access guarding lives in CrmLayout.
export default function PortalCrmPage() {
  return <Navigate to="/portal/crm/dashboard" replace />;
}
