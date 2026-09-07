export type MachineHealthLevel = "healthy" | "needs_attention" | "critical";

export type MachineHealthInput = {
  openClaims: number;
  pendingTsb: number;
  openTickets: number;
  serviceDays: number | null;
  hasHoursRegression: boolean;
  hasImporter: boolean;
  hasServicePartner: boolean;
};

export const SERVICE_OVERDUE_DAYS = 365;
export const SERVICE_DUE_SOON_DAYS = 300;

/**
 * Canonical machine-health precedence. Warranty origin (SP/MO) is deliberately
 * absent: warranty coverage and operational health are separate concepts.
 */
export function resolveMachineHealth(input: MachineHealthInput): {
  level: MachineHealthLevel;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (input.openClaims > 0) reasons.push(`${input.openClaims} åben(e) claim(s)`);
  if (input.pendingTsb > 0) reasons.push(`${input.pendingTsb} åben TSB`);
  if (input.serviceDays != null && input.serviceDays > SERVICE_OVERDUE_DAYS) reasons.push("Service forfalden");
  if (input.hasHoursRegression) reasons.push("Konflikt i driftstimer");
  if (reasons.length > 0) return { level: "critical", reasons };

  if (input.openTickets > 0) reasons.push(`${input.openTickets} åben(e) ticket(s)`);
  if (input.serviceDays != null && input.serviceDays > SERVICE_DUE_SOON_DAYS) reasons.push("Service nærmer sig");
  if (!input.hasImporter || !input.hasServicePartner) reasons.push("Manglende relationsdata");
  return { level: reasons.length > 0 ? "needs_attention" : "healthy", reasons };
}
