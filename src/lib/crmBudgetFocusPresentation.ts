import { EQUIPMENT_BY_MACHINE, localizedName } from "@/lib/crmBudgetService";
import type { Language } from "@/types/configurator";

const BUDGET_EQUIPMENT = Object.values(EQUIPMENT_BY_MACHINE).flat();

function comparableProductKey(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Prefer the Configurator-derived budget catalog; preserve the technical key as a safe fallback. */
export function budgetFocusProductLabel(
  productKey: string,
  productName: string | null | undefined,
  lang: Language,
): string {
  const normalizedKey = comparableProductKey(productKey);
  const canonical = BUDGET_EQUIPMENT.find((item) => comparableProductKey(item.key) === normalizedKey);
  if (canonical) {
    const itemNumber = canonical.varenr?.trim() || "";
    const name = localizedName(canonical.name, lang).trim();
    if (itemNumber && name && comparableProductKey(name) !== comparableProductKey(itemNumber)) {
      return `${itemNumber} · ${name}`;
    }
    return name || itemNumber || productKey;
  }

  const safeName = productName?.trim() || "";
  return safeName && comparableProductKey(safeName) !== normalizedKey ? safeName : productKey;
}

export function sortNoBudgetOrderRows<T extends { ordersQty: number; label: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.ordersQty - a.ordersQty || a.label.localeCompare(b.label));
}

export function noBudgetOrderTotals(rows: Array<{ ordersQty: number }>): { orders: number; items: number } {
  return {
    orders: rows.reduce((sum, row) => sum + row.ordersQty, 0),
    items: rows.length,
  };
}
