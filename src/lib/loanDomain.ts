export const LOAN_STATUSES = [
  'DRAFT', 'READY_FOR_REVIEW', 'AWAITING_ACCEPTANCE', 'ACCEPTED', 'ON_LOAN',
  'RETURN_INSPECTION', 'CLOSED_OK', 'CLOSED_WITH_DEVIATION', 'CANCELLED',
] as const;

export type LoanStatus = typeof LOAN_STATUSES[number];

export type LoanOverviewFilter = 'active' | 'closed' | 'all';

export function isLoanClosed(status: LoanStatus): boolean {
  return ['CLOSED_OK', 'CLOSED_WITH_DEVIATION', 'CANCELLED'].includes(status);
}

export function loanMatchesOverviewFilter(status: LoanStatus, filter: LoanOverviewFilter): boolean {
  return filter === 'all' || (filter === 'closed' ? isLoanClosed(status) : !isLoanClosed(status));
}

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

export function isLoanDateRangeValid(loanDate: string | null, expectedReturnDate: string | null): boolean {
  if (!loanDate || !expectedReturnDate) return true;
  return expectedReturnDate >= loanDate;
}

export interface LoanPreparationItem {
  item_type: 'machine' | 'equipment';
  serial_snapshot: string | null;
  asset_instance_id_snapshot?: string | null;
  brik_number_snapshot?: number | null;
  planning_supply_unit_id: string | null;
  fabric_asset_id?: string | null;
  usage_reading_value: number | null;
  usage_reading_unit: 'km' | 'hours' | null;
  photoKinds: string[];
}

export function getLoanPreparationIssues(input: {
  loanDate: string | null;
  expectedReturnDate: string | null;
  items: LoanPreparationItem[];
  serialNumbersConfirmed: boolean;
}): string[] {
  const issues: string[] = [];
  if (!input.loanDate) issues.push('loan_date');
  if (!input.expectedReturnDate) issues.push('expected_return_date');
  if (!isLoanDateRangeValid(input.loanDate, input.expectedReturnDate)) issues.push('date_range');
  if (input.items.length === 0) issues.push('asset');
  for (const item of input.items) {
    const hasPhysicalIdentity = Boolean(item.serial_snapshot?.trim()
      || (item.fabric_asset_id && item.asset_instance_id_snapshot?.trim() && item.brik_number_snapshot));
    if ((!item.planning_supply_unit_id && !item.fabric_asset_id) || !hasPhysicalIdentity) issues.push('serial');
    if (!item.photoKinds.includes('serial_plate')) issues.push('type_plate_photo');
    if (item.item_type === 'machine') {
      if (item.usage_reading_value === null) issues.push('usage_reading_value');
      if (!item.usage_reading_unit) issues.push('usage_reading_unit');
    }
  }
  if (!input.serialNumbersConfirmed) issues.push('serial_confirmation');
  return [...new Set(issues)];
}

export type LoanReturnPresentationState =
  | 'ON_LOAN'
  | 'PARTIALLY_RETURNED'
  | 'REVIEW_REQUIRED'
  | 'RECEIVED'
  | LoanStatus;

export interface LoanReturnDraftItem {
  caseItemId: string;
  selected: boolean;
  serialNumber: string | null;
  serialConfirmed: boolean;
  registeredBrikNumber: number | null;
  observedBrikNumber: string;
  checkoutReading: number | null;
  readingUnit: 'km' | 'hours' | null;
  returnReading: string;
  hasMeterPhoto: boolean;
  requiresReview: boolean;
  discrepancyNote: string;
  lowerReadingExplanation: string;
}

export type LoanReturnIssue =
  | 'serial_confirmation'
  | 'brik_required'
  | 'brik_mismatch'
  | 'return_reading'
  | 'return_meter_photo'
  | 'lower_reading_explanation'
  | 'discrepancy_note';

export function loanReceiptGroupKey(item: {
  id: string; asset_instance_id_snapshot: string | null; brik_number_snapshot: number | null;
}): string {
  const identity = item.asset_instance_id_snapshot?.split('|');
  return identity && ['LINE', 'SERIAL'].includes(identity[0]) && identity[1] && item.brik_number_snapshot !== null
    ? `${identity[1]}:BRIK:${item.brik_number_snapshot}` : `ITEM:${item.id}`;
}

export function getLoanReturnIssues(item: LoanReturnDraftItem): LoanReturnIssue[] {
  if (!item.selected) return [];
  const issues: LoanReturnIssue[] = [];
  if (item.serialNumber?.trim() && !item.serialConfirmed && !item.requiresReview) {
    issues.push('serial_confirmation');
  }
  if (item.registeredBrikNumber !== null) {
    const observed = Number(item.observedBrikNumber);
    if (!item.observedBrikNumber.trim() || !Number.isInteger(observed) || observed <= 0) {
      issues.push('brik_required');
    } else if (observed !== item.registeredBrikNumber && !item.requiresReview) {
      issues.push('brik_mismatch');
    }
  }
  if (item.readingUnit) {
    const returned = Number(item.returnReading);
    if (!item.returnReading.trim() || !Number.isFinite(returned) || returned < 0) {
      issues.push('return_reading');
    } else if (item.checkoutReading !== null && returned < item.checkoutReading
      && !item.lowerReadingExplanation.trim()) {
      issues.push('lower_reading_explanation');
    }
    if (!item.hasMeterPhoto) issues.push('return_meter_photo');
  }
  if (item.requiresReview && !item.discrepancyNote.trim()) issues.push('discrepancy_note');
  return issues;
}

export function calculateLoanUsage(checkout: number | null, returned: string): number | null {
  const returnValue = Number(returned);
  if (checkout === null || !returned.trim() || !Number.isFinite(returnValue)) return null;
  return returnValue - checkout;
}

export function isLoanEligibleForReceipt(status: LoanStatus): boolean {
  return ['ACCEPTED', 'ON_LOAN', 'RETURN_INSPECTION'].includes(status);
}

export function loanStatusTranslationKey(state: LoanReturnPresentationState): string {
  const keys: Record<string, string> = {
    DRAFT: 'loansStatusDraft',
    READY_FOR_REVIEW: 'loansStatusReadyForReview',
    AWAITING_ACCEPTANCE: 'loansStatusAwaitingAcceptance',
    ACCEPTED: 'loansStatusOnLoan',
    ON_LOAN: 'loansStatusOnLoan',
    RETURN_INSPECTION: 'loansStatusPartiallyReturned',
    PARTIALLY_RETURNED: 'loansStatusPartiallyReturned',
    REVIEW_REQUIRED: 'loansStatusReviewRequired',
    RECEIVED: 'loansStatusReceived',
    CLOSED_OK: 'loansStatusReceived',
    CLOSED_WITH_DEVIATION: 'loansStatusReceivedWithDeviation',
    CANCELLED: 'loansStatusCancelled',
  };
  return keys[state] ?? 'loansStatus';
}
