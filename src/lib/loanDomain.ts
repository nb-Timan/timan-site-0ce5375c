export const LOAN_STATUSES = [
  'DRAFT', 'AWAITING_ACCEPTANCE', 'ACCEPTED', 'ON_LOAN',
  'RETURN_INSPECTION', 'CLOSED_OK', 'CLOSED_WITH_DEVIATION', 'CANCELLED',
] as const;

export type LoanStatus = typeof LOAN_STATUSES[number];

export function loanDerivedTimingStatus(
  status: LoanStatus,
  expectedReturnDate: string | null,
  today = new Date(),
): 'DUE_SOON' | 'OVERDUE' | null {
  if (!expectedReturnDate || !['ACCEPTED', 'ON_LOAN'].includes(status)) return null;
  const [year, month, day] = expectedReturnDate.split('-').map(Number);
  const expectedUtc = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(expectedUtc)) return null;
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.round((expectedUtc - todayUtc) / 86_400_000);
  if (days < 0) return 'OVERDUE';
  return days <= 7 ? 'DUE_SOON' : null;
}

export function canAddLoanPhoto(currentCount: number): boolean {
  return currentCount >= 0 && currentCount < 2;
}

export function loanChangeRequiresNewAcceptance(status: LoanStatus): boolean {
  return !['DRAFT', 'CANCELLED'].includes(status);
}
