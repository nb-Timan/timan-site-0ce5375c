export type WonOrderValueRow = {
  total_value_dkk?: unknown;
};

export type FrozenOrderPricingState = {
  pricingSnapshot?: {
    totals?: {
      finalPrice?: unknown;
    };
  };
};

function nonNegativeAmount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/** Resolve a historical order total without consulting the current catalogue. */
export function resolveHistoricalOrderTotal(
  storedTotal: unknown,
  state?: FrozenOrderPricingState | null,
): number | null {
  return nonNegativeAmount(storedTotal)
    ?? nonNegativeAmount(state?.pricingSnapshot?.totals?.finalPrice);
}

/** Count and value the exact same won-order row set. */
export function summarizeWonOrderValues(rows: WonOrderValueRow[]) {
  let valueDkk = 0;
  let ordersWithValue = 0;

  for (const row of rows) {
    const value = nonNegativeAmount(row.total_value_dkk);
    if (value === null) continue;
    valueDkk += value;
    ordersWithValue += 1;
  }

  return {
    wonOrdersCount: rows.length,
    valueDkk,
    ordersWithValue,
    ordersMissingValue: rows.length - ordersWithValue,
  };
}
