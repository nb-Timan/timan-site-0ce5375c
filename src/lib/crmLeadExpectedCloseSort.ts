export type ExpectedCloseSortDirection = 'asc' | 'desc';

export interface ExpectedCloseSortable {
  expected_close_date?: string | null;
}

export function compareCrmLeadExpectedClose(
  a: ExpectedCloseSortable,
  b: ExpectedCloseSortable,
  direction: ExpectedCloseSortDirection,
): number {
  const aDate = a.expected_close_date || null;
  const bDate = b.expected_close_date || null;
  if (aDate === null && bDate === null) return 0;
  if (aDate === null) return 1;
  if (bDate === null) return -1;
  return direction === 'asc' ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
}
