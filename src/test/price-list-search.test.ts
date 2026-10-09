import { describe, expect, it } from "vitest";
import {
  filterPriceListItems,
  parsePriceListSkuTokens,
} from "@/lib/priceListSearch";
import type { PriceListItem } from "@/lib/priceListService";

function item(id: string, itemNumber: string, text: string): PriceListItem {
  return {
    id,
    item_number: itemNumber,
    renamed_from_item_number: null,
    item_text_da: text,
    item_text_de: null,
    item_text_en: null,
    price_dkk: 1,
    price_eur: null,
    price_sek: null,
    cost_price_dkk: null,
    cost_price_source: null,
    cost_price_updated_at: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    updated_by_email: null,
    is_dirty: false,
    last_published_at: null,
  };
}

const items: PriceListItem[] = [
  item("1", "411000", "RC-1000s"),
  item("2", "410910", "Slagleklipper"),
  item("3", "795018", "Komponentgaranti"),
  item("4", "4110001", "Næsten samme"),
];

describe("price list multi-SKU search", () => {
  it("matches one or multiple selected SKUs with OR semantics", () => {
    expect(filterPriceListItems(items, ["411000"], "").map((item) => item.item_number)).toEqual(["411000"]);
    expect(filterPriceListItems(items, ["411000", "410910", "795018"], "").map((item) => item.item_number))
      .toEqual(["411000", "410910", "795018"]);
  });

  it("updates the result when one selected SKU is removed", () => {
    expect(filterPriceListItems(items, ["411000", "410910", "795018"], "").map((item) => item.item_number))
      .toEqual(["411000", "410910", "795018"]);
    expect(filterPriceListItems(items, ["411000", "795018"], "").map((item) => item.item_number))
      .toEqual(["411000", "795018"]);
  });

  it("uses exact SKU matching and keeps valid matches when an unknown chip is present", () => {
    expect(filterPriceListItems(items, ["411000", "999999"], "").map((item) => item.item_number)).toEqual(["411000"]);
  });

  it("parses comma, newline, tab, and safe space separated pasted SKU lists without duplicates", () => {
    expect(parsePriceListSkuTokens("411000, 410910\n795018\t411000")).toEqual(["411000", "410910", "795018"]);
    expect(parsePriceListSkuTokens("411000 410910")).toEqual(["411000", "410910"]);
    expect(parsePriceListSkuTokens("RC-1000s machine")).toEqual([]);
  });

  it("does not turn ordinary text search into a SKU chip", () => {
    expect(parsePriceListSkuTokens("Skovl Timan 3330")).toEqual([]);
  });

  it("normalizes selected SKU chips case-insensitively", () => {
    expect(filterPriceListItems(items, ["v35-502", "411000"], "").map((item) => item.item_number)).toEqual(["411000"]);
  });

  it("combines selected SKUs and free text with intuitive AND semantics", () => {
    expect(filterPriceListItems(items, ["411000", "410910"], "RC-1000s").map((item) => item.item_number)).toEqual(["411000"]);
  });

  it("preserves normal free-text filtering and clears back to the full list", () => {
    expect(filterPriceListItems(items, [], "slagle").map((item) => item.item_number)).toEqual(["410910"]);
    expect(filterPriceListItems(items, [], "")).toHaveLength(4);
  });
});
