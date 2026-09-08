export type ContractAccessDurationUnit = 'hours' | 'days';

export const CONTRACT_ACCESS_DURATION_LIMITS = {
  hours: { min: 1, max: 168 },
  days: { min: 1, max: 30 },
} as const;

export function getContractAccessDurationMinutes(value: number, unit: ContractAccessDurationUnit): number | null {
  if (!Number.isInteger(value)) return null;
  const limits = CONTRACT_ACCESS_DURATION_LIMITS[unit];
  if (value < limits.min || value > limits.max) return null;
  return unit === 'hours' ? value * 60 : value * 24 * 60;
}

export function addContractAccessDuration(start: string, value: number, unit: ContractAccessDurationUnit): string | null {
  const minutes = getContractAccessDurationMinutes(value, unit);
  const startDate = new Date(start);
  if (minutes === null || Number.isNaN(startDate.getTime())) return null;
  return new Date(startDate.getTime() + minutes * 60_000).toISOString();
}
