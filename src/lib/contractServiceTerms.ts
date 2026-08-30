export const DEFAULT_CONTRACT_SERVICE_HOURLY_RATE_DKK = 360;

export type ContractServiceTermsSnapshot = {
  currency: 'DKK';
  hourlyRateDkk: number;
  laborHourlyRateDkk: number;
  travelHourlyRateDkk: number;
  rateModel: 'shared_labor_and_travel_rate';
};

export function normalizeContractServiceHourlyRateDkk(value: unknown): number {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.replace(',', '.'))
      : Number.NaN;

  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_CONTRACT_SERVICE_HOURLY_RATE_DKK;
  return Math.round(numeric * 100) / 100;
}

export function isValidContractServiceHourlyRateDkk(value: unknown): boolean {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.replace(',', '.'))
      : Number.NaN;

  return Number.isFinite(numeric) && numeric > 0;
}

export function formatContractServiceHourlyRateDkk(value: unknown): string {
  const rate = normalizeContractServiceHourlyRateDkk(value);
  return `${new Intl.NumberFormat('da-DK', { maximumFractionDigits: 2 }).format(rate)} kr.`;
}

export function formatContractServiceHourlyRatePerHourDkk(value: unknown): string {
  return `${formatContractServiceHourlyRateDkk(value)}/time`;
}

export function buildContractServiceTermsSnapshot(form: { serviceHourlyRateDkk?: unknown }): ContractServiceTermsSnapshot {
  const hourlyRateDkk = normalizeContractServiceHourlyRateDkk(form.serviceHourlyRateDkk);
  return {
    currency: 'DKK',
    hourlyRateDkk,
    laborHourlyRateDkk: hourlyRateDkk,
    travelHourlyRateDkk: hourlyRateDkk,
    rateModel: 'shared_labor_and_travel_rate',
  };
}

export function shouldResetContractServiceConfirmation(
  previousRate: unknown,
  nextRate: unknown,
  confirmed: boolean,
) {
  if (!confirmed) return false;
  return normalizeContractServiceHourlyRateDkk(previousRate) !== normalizeContractServiceHourlyRateDkk(nextRate);
}
