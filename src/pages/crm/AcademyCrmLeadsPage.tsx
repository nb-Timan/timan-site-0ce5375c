import { type ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import CrmLeadsPage from '@/pages/crm/CrmLeadsPage';
import { academyCrmSandbox } from '@/lib/academyCrmSandbox';

/** Academy route/context only. The shared production CRM list renders below. */
export function AcademyCrmRoute({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  const part = params.get('academy_part') === '2' ? 2 : 1;
  if (!academyCrmSandbox.isActive()) return <Navigate to="/portal/crm/leads" replace />;
  if (part === 2 && !academyCrmSandbox.getProgress().part1Completed) return <Navigate to="/academy/crm/leads?academy_mode=true&academy_part=1" replace />;
  return <>{children}</>;
}

export default function AcademyCrmLeadsPage() {
  const [params] = useSearchParams();
  const part = params.get('academy_part') === '2' ? 2 : 1;
  return (
    <AcademyCrmRoute>
      <CrmLeadsPage academyPart={part} />
    </AcademyCrmRoute>
  );
}
