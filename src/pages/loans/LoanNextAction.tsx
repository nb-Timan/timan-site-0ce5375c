import { Link } from 'react-router-dom';
import type { LoanCaseActionState } from '@/lib/loanService';

/** Only presents server-authorized next steps; never treats review as a handover. */
export default function LoanNextAction({ caseId, state, label }: {
  caseId: string; state?: LoanCaseActionState | null; label: (key: string) => string;
}) {
  if (!state?.can_review && !state?.can_accept) return null;
  return <Link to={`/portal/loans/${caseId}/accept`} className="inline-flex min-h-9 items-center rounded-md border border-emerald-700 px-3 text-xs font-semibold text-emerald-900">
    {label(state.can_review ? 'loansReviewCheckout' : 'loansAcceptance')}
  </Link>;
}
