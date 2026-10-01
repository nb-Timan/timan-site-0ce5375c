export const PRICE_TOOL_MARKER = "PRISLISTEVÆRKTØJ";

export interface PriceToolSettings {
  sekRateDkkPer100: number;
  eurRateDkkPer1: number;
  standardDiscountPct: number;
  massChangePct: number;
}

export interface PriceToolCalculationInput {
  currentDkk: number | null;
  manualDkk: number | null;
  rowChangePct: number | null;
  massChangeSelected: boolean;
  costPriceDkk: number | null;
  settings: PriceToolSettings;
}

export interface PriceToolCalculation {
  priceDkk: number | null;
  priceSek: number | null;
  priceEur: number | null;
  contributionMarginDkk: number | null;
  contributionMarginPct: number | null;
}

export const DEFAULT_PRICE_TOOL_SETTINGS: PriceToolSettings = {
  sekRateDkkPer100: 66.5,
  eurRateDkkPer1: 7.45,
  standardDiscountPct: 0.25,
  massChangePct: 0,
};

export function roundPriceToolMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Canonical calculation used for exported cached values and formula-independent reimport. */
export function calculatePriceToolValues(input: PriceToolCalculationInput): PriceToolCalculation {
  const { settings } = input;
  let priceDkk = input.manualDkk;

  if (priceDkk == null && input.massChangeSelected && input.currentDkk != null) {
    priceDkk = roundPriceToolMoney(input.currentDkk * (1 + settings.massChangePct));
  }
  if (priceDkk == null && input.rowChangePct != null && input.currentDkk != null) {
    priceDkk = roundPriceToolMoney(input.currentDkk * (1 + input.rowChangePct));
  }
  if (priceDkk == null) priceDkk = input.currentDkk;
  if (priceDkk != null) priceDkk = roundPriceToolMoney(priceDkk);

  const priceSek = priceDkk != null && settings.sekRateDkkPer100 > 0
    ? roundPriceToolMoney((priceDkk / settings.sekRateDkkPer100) * 100)
    : null;
  const priceEur = priceDkk != null && settings.eurRateDkkPer1 > 0
    ? roundPriceToolMoney(priceDkk / settings.eurRateDkkPer1)
    : null;
  const contributionMarginDkk = priceDkk != null && input.costPriceDkk != null
    ? roundPriceToolMoney(priceDkk * (1 - settings.standardDiscountPct) - input.costPriceDkk)
    : null;
  const contributionMarginPct = priceDkk != null && priceDkk !== 0 && contributionMarginDkk != null
    ? contributionMarginDkk / priceDkk
    : null;

  return { priceDkk, priceSek, priceEur, contributionMarginDkk, contributionMarginPct };
}

export function priceToolFormulas(row: number) {
  return {
    currentDb: `IF(OR(E${row}="",D${row}=""),"",ROUND(E${row}*(1-$B$5)-D${row},2))`,
    currentDg: `IF(OR(E${row}="",E${row}=0,H${row}=""),"",H${row}/E${row})`,
    priceDkk: `IF(ISNUMBER(J${row}),J${row},IF(LOWER(TRIM(L${row}))="x",ROUND(E${row}*(1+$B$6),2),IF(ISNUMBER(K${row}),ROUND(E${row}*(1+K${row}),2),E${row})))`,
    priceSek: `IF(M${row}="","",ROUND(M${row}/$B$3*100,2))`,
    priceEur: `IF(M${row}="","",ROUND(M${row}/$B$4,2))`,
    newDb: `IF(OR(M${row}="",D${row}=""),"",ROUND(M${row}*(1-$B$5)-D${row},2))`,
    newDg: `IF(OR(M${row}="",M${row}=0,P${row}=""),"",P${row}/M${row})`,
  };
}
