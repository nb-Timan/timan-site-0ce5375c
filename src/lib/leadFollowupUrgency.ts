export type LeadFollowupUrgency = "overdue" | "soon" | "later" | "none";

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function classifyLeadFollowupUrgency(
  value: string | null | undefined,
  now = new Date(),
): LeadFollowupUrgency {
  if (!value) return "none";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "none";
  const diffDays = Math.floor(
    (startOfLocalDay(date).getTime() - startOfLocalDay(now).getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays < 0) return "overdue";
  if (diffDays <= 20) return "soon";
  return "later";
}
