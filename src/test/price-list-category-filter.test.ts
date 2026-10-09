import { describe, expect, it } from "vitest";
import {
  buildConfiguratorSeed,
  buildVarenrGroupMap,
  filterByProductGroup,
  PRODUCT_GROUP_ORDER,
  type ProductGroupKey,
} from "@/lib/configuratorPriceSeed";
import { filterPriceListItems } from "@/lib/priceListSearch";

describe("price list category filters", () => {
  const rows = buildConfiguratorSeed();
  const groupMap = buildVarenrGroupMap();
  const visibleGroups = PRODUCT_GROUP_ORDER.filter(
    (group) => group !== "Options/accessories/other",
  );

  it("shows the complete deduplicated canonical dataset by default", () => {
    expect(filterByProductGroup(rows, "all", groupMap)).toHaveLength(rows.length);
    expect(new Set(rows.map((row) => row.item_number)).size).toBe(rows.length);
  });

  it.each(visibleGroups)("filters %s from canonical product-group data", (group) => {
    const filtered = filterByProductGroup(rows, group, groupMap);

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((row) => groupMap.get(row.item_number) === group)).toBe(true);
  });

  it("combines category and existing SKU/text search", () => {
    const group: ProductGroupKey = "RC-1000s";
    const searchable = filterByProductGroup(rows, group, groupMap);
    const target = searchable.find((row) => row.item_number === "410910") ?? searchable[0];
    const filtered = filterByProductGroup(
      filterPriceListItems(rows, [], target.item_number),
      group,
      groupMap,
    );

    expect(filtered.map((row) => row.item_number)).toEqual([target.item_number]);
  });

  it("does not leak another product group into a filtered result", () => {
    const rc751 = filterByProductGroup(rows, "RC-751", groupMap);
    const rc1000s = filterByProductGroup(rows, "RC-1000s", groupMap);

    expect(rc751.some((row) => rc1000s.some((other) => other.item_number === row.item_number))).toBe(false);
  });
});
