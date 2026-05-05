/**
 * Configurator → Price list seed.
 *
 * READ-ONLY view of PRODUCTS / ACCESSORIES from src/data/machines.ts so that
 * Backend → Prislister can be populated from current configurator data.
 *
 * SAFETY:
 *  - Pure read. Never mutates configurator data.
 *  - Configurator continues to read prices from PRODUCTS/ACCESSORIES.
 *  - SEK is always null (no source in configurator).
 *  - Header / hidden / no-varenr / zero-priced rows are skipped.
 *  - Dedup on item_number; first matching group wins (RC-751 → RC-1000s →
 *    Timan 3330 → Loose tools → Other).
 */

import {
  PRODUCTS,
  ACCESSORIES,
  getLooseToolAccessories,
} from "@/data/machines";
import type { Accessory, Machine } from "@/types/configurator";

export type ProductGroupKey =
  | "RC-751"
  | "RC-1000s"
  | "Timan 3330"
  | "Timan 2620"
  | "Loader-Line and CS-200 Traktor"
  | "Løse redskaber / attachments"
  | "Options/accessories/other";

export const PRODUCT_GROUP_ORDER: ProductGroupKey[] = [
  "RC-751",
  "RC-1000s",
  "Timan 3330",
  "Timan 2620",
  "Loader-Line and CS-200 Traktor",
  "Løse redskaber / attachments",
  "Options/accessories/other",
];

export interface SeedRow {
  item_number: string;
  item_text_da: string;
  price_dkk: number | null;
  price_eur: number | null;
  price_sek: null;
  group: ProductGroupKey;
}

function pickDa(name: Accessory["name"] | Machine["name"]): string {
  if (typeof name === "string") return name;
  if (name && typeof name === "object") {
    const da = (name as { da?: string }).da;
    if (da) return da;
    const en = (name as { en?: string }).en;
    if (en) return en;
  }
  return "";
}

function machineRow(m: Machine, group: ProductGroupKey): SeedRow | null {
  const item = String(m.varenr || "").trim();
  if (!item) return null;
  return {
    item_number: item,
    item_text_da: pickDa(m.name),
    price_dkk: Number.isFinite(m.priceDKK) ? m.priceDKK : null,
    price_eur: Number.isFinite(m.priceEUR) ? m.priceEUR : null,
    price_sek: null,
    group,
  };
}

function accessoryRow(a: Accessory, group: ProductGroupKey): SeedRow | null {
  if (!a || a.isHeader) return null;
  const item = String(a.varenr || "").trim();
  if (!item || item.toUpperCase() === "HEADER") return null;
  const dkk = Number.isFinite(a.priceDKK) ? a.priceDKK : 0;
  const eur = Number.isFinite(a.priceEUR) ? a.priceEUR : 0;
  // Skip rows where both prices are zero (placeholders / option-only headers)
  if (!dkk && !eur) return null;
  return {
    item_number: item,
    item_text_da: pickDa(a.name),
    price_dkk: dkk || null,
    price_eur: eur || null,
    price_sek: null,
    group,
  };
}

/**
 * Build a deduplicated, ordered list of seed rows from configurator data.
 * Earlier groups win on duplicates.
 */
export function buildConfiguratorSeed(): SeedRow[] {
  const out: SeedRow[] = [];
  const seen = new Set<string>();

  function push(row: SeedRow | null) {
    if (!row) return;
    if (seen.has(row.item_number)) return;
    seen.add(row.item_number);
    out.push(row);
  }

  // 1. RC-751
  const rc751 = PRODUCTS["RC-751"];
  if (rc751) push(machineRow(rc751, "RC-751"));
  for (const a of ACCESSORIES["RC-751"] || []) push(accessoryRow(a, "RC-751"));

  // 2. RC-1000s
  const rc1000 = PRODUCTS["RC-1000S"];
  if (rc1000) push(machineRow(rc1000, "RC-1000s"));
  for (const a of ACCESSORIES["RC-1000S"] || []) push(accessoryRow(a, "RC-1000s"));

  // 3. Timan 3330
  const t3330 = PRODUCTS["Timan 3330"];
  if (t3330) push(machineRow(t3330, "Timan 3330"));
  for (const a of ACCESSORIES["Timan 3330"] || []) push(accessoryRow(a, "Timan 3330"));

  // 4. Timan 2620
  const t2620 = PRODUCTS["Timan 2620"];
  if (t2620) push(machineRow(t2620, "Timan 2620"));
  for (const a of ACCESSORIES["Timan 2620"] || []) push(accessoryRow(a, "Timan 2620"));

  // 5. Loader Line
  const loader = PRODUCTS["Loader-Line and CS-200 Traktor"];
  if (loader) push(machineRow(loader, "Loader-Line and CS-200 Traktor"));
  for (const a of ACCESSORIES["Loader-Line and CS-200 Traktor"] || []) push(accessoryRow(a, "Loader-Line and CS-200 Traktor"));

  // 6. Loose tools
  for (const a of getLooseToolAccessories()) {
    push(accessoryRow(a, "Løse redskaber / attachments"));
  }

  // 5. Anything else from PRODUCTS not yet covered
  for (const m of Object.values(PRODUCTS)) {
    push(machineRow(m, "Options/accessories/other"));
  }

  return out;
}

/**
 * Map varenr → group, used to label/sort existing DB rows.
 */
export function buildVarenrGroupMap(): Map<string, ProductGroupKey> {
  const map = new Map<string, ProductGroupKey>();
  for (const r of buildConfiguratorSeed()) map.set(r.item_number, r.group);
  return map;
}

export function groupForItemNumber(
  itemNumber: string,
  map?: Map<string, ProductGroupKey>,
): ProductGroupKey {
  const m = map ?? buildVarenrGroupMap();
  return m.get(itemNumber) ?? "Options/accessories/other";
}

export function groupOrderIndex(g: ProductGroupKey): number {
  const i = PRODUCT_GROUP_ORDER.indexOf(g);
  return i === -1 ? PRODUCT_GROUP_ORDER.length : i;
}
