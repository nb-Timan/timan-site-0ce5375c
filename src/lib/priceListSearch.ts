import type { PriceListItem } from "@/lib/priceListService";

const SKU_TOKEN = /^(?=.*\d)[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export function normalizePriceListSku(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Accept pasted SKU lists without turning ordinary product-text searches into tags.
 */
export function parsePriceListSkuTokens(value: string): string[] {
  const chunks = value
    .trim()
    .split(/[,\n\t]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (chunks.length === 0) return [];

  const tokens = chunks.flatMap((chunk) => chunk.split(/\s+/).filter(Boolean));
  if (tokens.length === 0 || !tokens.every((token) => SKU_TOKEN.test(token))) return [];

  return [...new Set(tokens.map(normalizePriceListSku))];
}

export function filterPriceListItems(
  items: PriceListItem[],
  skuFilters: string[],
  textFilter: string,
): PriceListItem[] {
  const selectedSkus = new Set(skuFilters.map(normalizePriceListSku));
  const term = textFilter.trim().toLowerCase();

  return items.filter((item) => {
    const itemNumber = normalizePriceListSku(item.item_number);
    const previousItemNumber = normalizePriceListSku(item.renamed_from_item_number ?? "");
    const matchesSku = selectedSkus.size === 0 || selectedSkus.has(itemNumber) || selectedSkus.has(previousItemNumber);
    if (!matchesSku) return false;

    return !term || [
      item.item_number,
      item.renamed_from_item_number,
      item.item_text_da,
      item.item_text_de,
      item.item_text_en,
    ].some((value) => value?.toLowerCase().includes(term));
  });
}
