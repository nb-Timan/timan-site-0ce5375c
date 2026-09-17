export const formatEditableDanishNumber = (value: number) => String(value).replace('.', ',');

export const parseDanishNumericInput = (rawValue: string): number | null => {
  const raw = rawValue.trim().replace(/\s/g, '');

  if (!raw || !/^\d+(?:[.,]\d+)?$/.test(raw)) {
    return null;
  }

  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(?:\.\d{3})+$/.test(raw)
      ? raw.replace(/\./g, '')
      : raw;
  const value = Number(normalized);

  return Number.isFinite(value) ? value : null;
};
