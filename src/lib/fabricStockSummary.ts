import { fabricLoanPhysicalGroupKey, type FabricLoanAsset } from '@/lib/fabricLoanStock';

/** Derived presentation facts, not an alternative inventory or pricing store.
 * Only a validated server projection may supply these. The current signed
 * projection has neither valuation nor receipt fields, so its resolver is empty.
 */
export interface FabricStockVerifiedFacts {
  valueDkk: number | null;
  valuationCurrency: string | null;
  valuationReference: string | null;
  receivedDate: string | null;
  receiptReference: string | null;
}
export type FabricStockFactsResolver = (asset: FabricLoanAsset) => FabricStockVerifiedFacts | null;
export const currentFabricStockFacts: FabricStockFactsResolver = () => null;

export interface FabricStockSummaryItem {
  key: string;
  assets: FabricLoanAsset[];
  quantity: number | null;
  valueDkk: number | null;
  receivedDate: string | null;
}
export interface FabricStockSummary {
  lineCount: number;
  groupCount: number;
  quantity: number;
  unknownQuantityGroups: number;
  documentedValueDkk: number;
  valuedLineCount: number;
  missingValueLines: number;
  missingDateGroups: number;
  mostExpensive: FabricStockSummaryItem[];
  oldest: FabricStockSummaryItem[];
}

function validDate(value: string | null, today: string): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

/** Receives the browser's already-filtered rows. Never introduces hidden rows. */
export function summarizeFabricStock(
  assets: FabricLoanAsset[],
  factsFor: FabricStockFactsResolver = currentFabricStockFacts,
  today = new Date().toISOString().slice(0, 10),
): FabricStockSummary {
  const rows = [...new Map(assets.map(asset => [asset.asset_id, asset])).values()];
  const groups = new Map<string, FabricLoanAsset[]>();
  for (const asset of rows) {
    const key = fabricLoanPhysicalGroupKey(asset);
    groups.set(key, [...(groups.get(key) ?? []), asset]);
  }
  // A valuation reference identifies one economic line even when it has aliases.
  const references = new Map<string, Set<number>>();
  const referenceGroups = new Map<string, Set<string>>();
  const facts = new Map(rows.map(asset => [asset.asset_id, factsFor(asset)]));
  for (const asset of rows) {
    const fact = facts.get(asset.asset_id);
    if (fact?.valuationCurrency === 'DKK' && fact.valuationReference?.trim() && typeof fact.valueDkk === 'number'
      && Number.isFinite(fact.valueDkk) && fact.valueDkk >= 0) {
      const values = references.get(fact.valuationReference) ?? new Set<number>();
      values.add(fact.valueDkk); references.set(fact.valuationReference, values);
      const owners = referenceGroups.get(fact.valuationReference) ?? new Set<string>();
      owners.add(fabricLoanPhysicalGroupKey(asset)); referenceGroups.set(fact.valuationReference, owners);
    }
  }
  const seenReferences = new Set<string>();
  let quantity = 0, unknownQuantityGroups = 0, documentedValueDkk = 0, valuedLineCount = 0;
  const items: FabricStockSummaryItem[] = [];
  for (const [key, group] of groups) {
    const quantities = new Set(group.map(asset => asset.inventory_qty));
    const serials = new Set(group.map(asset => asset.serial_number_normalized?.trim()).filter(Boolean));
    const warehouses = new Set(group.map(asset => asset.warehouse_location_code));
    const firstQuantity = group[0].inventory_qty;
    const groupQuantity = quantities.size === 1 && typeof firstQuantity === 'number'
      && Number.isFinite(firstQuantity) && firstQuantity >= 0
      && !group.some(asset => asset.identity_conflict || asset.brik_group_serial_conflict) && serials.size <= 1 && warehouses.size === 1
      ? firstQuantity : null;
    if (groupQuantity === null) unknownQuantityGroups += 1; else quantity += groupQuantity;
    const groupReferences = new Set<string>();
    let groupValue = 0, completeValue = true;
    const dates = new Set<string>();
    let completeDate = true;
    for (const asset of group) {
      const fact = facts.get(asset.asset_id);
      const reference = fact?.valuationReference;
      if (fact?.valuationCurrency !== 'DKK' || !reference?.trim() || references.get(reference)?.size !== 1 || referenceGroups.get(reference)?.size !== 1
        || typeof fact?.valueDkk !== 'number' || !Number.isFinite(fact.valueDkk) || fact.valueDkk < 0) completeValue = false;
      else {
        valuedLineCount += 1;
        if (!groupReferences.has(reference)) { groupValue += fact.valueDkk; groupReferences.add(reference); }
        if (!seenReferences.has(reference)) { documentedValueDkk += fact.valueDkk; seenReferences.add(reference); }
      }
      const date = fact?.receiptReference?.trim() ? validDate(fact.receivedDate, today) : null;
      if (!date) completeDate = false; else dates.add(date);
    }
    items.push({ key, assets: group, quantity: groupQuantity,
      valueDkk: completeValue && groupQuantity !== null ? roundMoney(groupValue) : null,
      receivedDate: completeDate && dates.size === 1 && groupQuantity !== null ? [...dates][0] : null });
  }
  // Quantities are physical pieces; a bulk source row stays one source row.
  quantity = Math.round(quantity * 1e6) / 1e6;
  const compareKey = (a: FabricStockSummaryItem, b: FabricStockSummaryItem) => a.key.localeCompare(b.key);
  return { lineCount: rows.length, groupCount: groups.size, quantity, unknownQuantityGroups,
    documentedValueDkk: roundMoney(documentedValueDkk), valuedLineCount,
    missingValueLines: rows.length - valuedLineCount,
    missingDateGroups: items.filter(item => item.receivedDate === null).length,
    mostExpensive: items.filter(item => item.valueDkk !== null).sort((a, b) => b.valueDkk! - a.valueDkk! || compareKey(a, b)).slice(0, 3),
    oldest: items.filter(item => item.receivedDate !== null).sort((a, b) => a.receivedDate!.localeCompare(b.receivedDate!) || compareKey(a, b)).slice(0, 3) };
}
