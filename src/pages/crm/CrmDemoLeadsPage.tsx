import { Navigate } from 'react-router-dom';

export default function CrmDemoLeadsPage() {
  return <Navigate to="/portal/crm/leads?type=demo" replace />;
}
