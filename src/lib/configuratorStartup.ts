export type ConfiguratorStartupOption = 'no_bridge' | 'with_bridge' | 'other';

const PAID_STARTUP_OPTIONS = new Set<ConfiguratorStartupOption>(['no_bridge', 'with_bridge']);

const COUNTRY_ALIASES: Record<string, string> = {
  DANMARK: 'DK',
  DENMARK: 'DK',
  DÄNEMARK: 'DK',
};

export function normalizeConfiguratorMarketCountry(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!normalized) return null;
  return COUNTRY_ALIASES[normalized] ?? normalized;
}

export function resolveConfiguratorMarketCountry(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeConfiguratorMarketCountry(candidate);
    if (normalized) return normalized;
  }
  return null;
}

export function isPaidConfiguratorStartupOption(
  option: string | null | undefined,
): option is 'no_bridge' | 'with_bridge' {
  return PAID_STARTUP_OPTIONS.has(option as ConfiguratorStartupOption);
}

export function configuratorStartupOptionsForCountry(
  country: string | null | undefined,
): ConfiguratorStartupOption[] {
  return normalizeConfiguratorMarketCountry(country) === 'DK'
    ? ['no_bridge', 'with_bridge', 'other']
    : ['other'];
}

export function reconcileConfiguratorStartupOption(
  country: string | null | undefined,
  option: string | null | undefined,
): ConfiguratorStartupOption | null {
  if (option !== 'no_bridge' && option !== 'with_bridge' && option !== 'other') return null;
  if (isPaidConfiguratorStartupOption(option) && normalizeConfiguratorMarketCountry(country) !== 'DK') return null;
  return option;
}
