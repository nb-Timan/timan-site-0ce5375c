/**
 * Centralised date formatting for the entire portal.
 *
 * All user-facing dates must be displayed as `dd.MM.yyyy` (e.g. 26.05.2026).
 * Sorting/filtering still use the underlying ISO/Date values — only the
 * display layer is normalised here.
 */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Format a Date / ISO string / yyyy-MM-dd as `dd.MM.yyyy`. */
export function formatDate(input?: string | Date | null): string {
  if (!input) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Format a Date / ISO string as `dd.MM.yyyy HH:mm`. */
export function formatDateTime(input?: string | Date | null): string {
  if (!input) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
