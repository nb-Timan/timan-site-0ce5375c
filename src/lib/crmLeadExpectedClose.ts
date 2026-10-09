const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDateParts(value: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(year, month, 0).getDate();
  return day >= 1 && day <= lastDay ? { year, month, day } : null;
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function localDateToIso(date: Date): string {
  return formatIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function addMonthsToIsoDate(baseIso: string, months: number): string {
  const parsed = parseIsoDateParts(baseIso);
  if (!parsed) return addMonthsToIsoDate(localDateToIso(new Date()), months);
  const targetMonthIndex = parsed.year * 12 + parsed.month - 1 + months;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex - targetYear * 12 + 1;
  const targetDay = Math.min(parsed.day, new Date(targetYear, targetMonth, 0).getDate());
  return formatIsoDate(targetYear, targetMonth, targetDay);
}

export function isExpectedCloseWithinTwoCalendarMonths(
  expectedCloseDate: string | null | undefined,
  todayIso = localDateToIso(new Date()),
): boolean {
  if (!expectedCloseDate || !parseIsoDateParts(expectedCloseDate) || !parseIsoDateParts(todayIso)) return false;
  return expectedCloseDate >= todayIso && expectedCloseDate <= addMonthsToIsoDate(todayIso, 2);
}
