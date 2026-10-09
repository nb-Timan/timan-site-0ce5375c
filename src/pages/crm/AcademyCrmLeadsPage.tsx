import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import CrmLeadsPage from '@/pages/crm/CrmLeadsPage';
import { academyCrmSandbox } from '@/lib/academyCrmSandbox';

/** Academy route/context only. The shared production CRM list renders below. */
export function AcademyCrmRoute({ children }: { children: ReactNode }) {
  const part = academyCrmSandbox.getPart();
  if (!academyCrmSandbox.isActive()) return <Navigate to="/portal/crm/leads" replace />;
  if (part === 2 && !academyCrmSandbox.getProgress().part1Completed) return <Navigate to="/academy/crm/leads?academy_mode=true&academy_part=1" replace />;
  return <>{children}</>;
}

export default function AcademyCrmLeadsPage() {
  const part = academyCrmSandbox.getPart();
  return (
    <AcademyCrmRoute>
      <CrmLeadsPage academyPart={part} />
    </AcademyCrmRoute>
  );
}
