export const LOAN_STATUSES = [
  'DRAFT', 'READY_FOR_REVIEW', 'AWAITING_ACCEPTANCE', 'ACCEPTED', 'ON_LOAN',
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
