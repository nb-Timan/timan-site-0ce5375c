import { currentFiscalYearForBudget, fiscalYearForDate } from '@/lib/crmBudgetService';

export interface SellerOverviewMonthPeriod {
  from: Date;
  to: Date;
  monthIndex: number;
  belongsToSelectedYear: boolean;
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, amount: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

export function sellerOverviewDefaultYear(now: Date = new Date()): number {
  return currentFiscalYearForBudget(now);
}

export function sellerOverviewDateBelongsToYear(
  value: string | Date | null | undefined,
  year: number,
): boolean {
  return value != null && fiscalYearForDate(value) === year;
}

export function sellerOverviewMonthPeriods(
  year: number,
  now: Date = new Date(),
): { last: SellerOverviewMonthPeriod; current: SellerOverviewMonthPeriod; next: SellerOverviewMonthPeriod } {
  const monthIndex = now.getMonth();
  const calendarYear = monthIndex >= 6 ? year : year + 1;
  const currentStart = startOfMonth(new Date(calendarYear, monthIndex, 1));
  const starts = {
    last: addMonths(currentStart, -1),
    current: currentStart,
    next: addMonths(currentStart, 1),
  };
  const period = (from: Date): SellerOverviewMonthPeriod => ({
    from,
    to: addMonths(from, 1),
    monthIndex: from.getMonth(),
    belongsToSelectedYear: fiscalYearForDate(from) === year,
  });
  return { last: period(starts.last), current: period(starts.current), next: period(starts.next) };
}
