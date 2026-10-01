import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPreview,
  buildPriceImportPayload,
  mergeCanonicalPriceItems,
  type CsvPriceRow,
  type PriceListItem,
} from "@/lib/priceListService";
import { buildConfiguratorSeed } from "@/lib/configuratorPriceSeed";
import { RC751_PRICE_TOOL_FIXTURE } from "@/test/fixtures/priceListRc751Roundtrip";

const storedItem: PriceListItem = {
  id: "stored-410040",
  item_number: "410040",
  renamed_from_item_number: null,
  item_text_da: "RC-751 Basismaskine",
  item_text_de: "RC-751 Basismaschine",
  item_text_en: "RC-751 Base machine",
  cost_price_dkk: 70000,
  price_dkk: 167500,
  price_sek: 251879.7,
  price_eur: 22483.22,
  cost_price_source: "existing.xlsx",
  cost_price_updated_at: "2026-09-30T12:00:00.000Z",
  updated_at: "2026-09-30T12:00:00.000Z",
  updated_by_email: "backend@timan.dk",
  is_dirty: false,
  last_published_at: null,
};

function canonicalSeedItem(
  seed: ReturnType<typeof buildConfiguratorSeed>[number],
): PriceListItem {
  return {
    id: `configurator-${seed.item_number}`,
    item_number: seed.item_number,
    renamed_from_item_number: null,
    item_text_da: seed.item_text_da,
    item_text_de: null,
    item_text_en: null,
    cost_price_dkk: null,
    price_dkk: seed.price_dkk,
    price_sek: seed.price_sek,
    price_eur: seed.price_eur,
    cost_price_source: null,
    cost_price_updated_at: null,
    updated_at: "",
    updated_by_email: null,
    is_dirty: false,
    last_published_at: null,
  };
}

describe("COST_ONLY price import", () => {
  it("viser kun kostprisændringen og ignorerer tekst samt salgspriser", () => {
    const row: CsvPriceRow = {
      item_number: "410040",
      item_text_da: "Manipuleret tekst",
      cost_price_dkk: "72.515,88",
      price_dkk: "ikke-et-tal",
      price_sek: "1",
      price_eur: "2",
    };

    const preview = buildPreview([row], [storedItem], "COST_ONLY", new Set(["410040"]));

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({ bucket: "update", item_number: "410040" });
    expect(preview[0].changes).toEqual([
      { field: "cost_price_dkk", oldValue: "70000", newValue: "72515.88" },
    ]);
  });

  it("serialiserer aldrig ikke-kostfelter, selv når preview-inputtet er manipuleret", () => {
    const row: CsvPriceRow = {
      item_number: "410040",
      item_text_da: "Må ikke skrives",
      cost_price_dkk: "72515.88",
      price_dkk: "999999",
      price_sek: "999999",
      price_eur: "999999",
    };
    const preview = buildPreview([row], [storedItem], "COST_ONLY", new Set(["410040"]));
    const payload = buildPriceImportPayload(preview, "costs.xlsx", "COST_ONLY", "RC-751");

    expect(payload).toEqual({
      import_mode: "COST_ONLY",
      machine_scope: "RC-751",
      file_name: "costs.xlsx",
      rows: [{ item_number: "410040", cost_price_dkk: "72515.88" }],
    });
    expect(payload.rows[0]).not.toHaveProperty("item_text_da");
    expect(payload.rows[0]).not.toHaveProperty("price_dkk");
    expect(payload.rows[0]).not.toHaveProperty("price_sek");
    expect(payload.rows[0]).not.toHaveProperty("price_eur");
  });

  it("sender kun canonical identitetsmetadata for en manglende cost overlay", () => {
    const canonicalOnly = { ...storedItem, id: "configurator-410040", cost_price_dkk: null };
    const preview = buildPreview(
      [{ item_number: "410040", cost_price_dkk: "72515.88", price_dkk: "1" }],
      [canonicalOnly],
      "COST_ONLY",
      new Set(),
    );

    expect(buildPriceImportPayload(preview, "costs.xlsx", "COST_ONLY", "RC-751").rows).toEqual([{
      item_number: "410040",
      cost_price_dkk: "72515.88",
      catalog_source: "CANONICAL_CONFIGURATOR",
    }]);
  });

  it("afviser ukendte, men accepterer canonical Configurator-varer som eksisterende", () => {
    const unknown = buildPreview(
      [{ item_number: "UNKNOWN", cost_price_dkk: "10" }],
      [storedItem],
      "COST_ONLY",
      new Set(["410040"]),
    );
    const configuratorOnly = buildPreview(
      [{ item_number: "410040", cost_price_dkk: "72515.88" }],
      [storedItem],
      "COST_ONLY",
      new Set(),
    );

    expect(unknown[0]).toMatchObject({ bucket: "error", existing: null });
    expect(unknown[0].errorMessage).toContain("opretter aldrig nye produkter");
    expect(configuratorOnly[0]).toMatchObject({
      bucket: "update",
      item_number: "410040",
      existingPersisted: false,
    });
    expect(buildPriceImportPayload(unknown, "costs.xlsx", "COST_ONLY", "all").rows).toEqual([]);
  });

  it("løser alle syv RC-751 varer gennem samme canonical katalog som fuld import", () => {
    const canonical = mergeCanonicalPriceItems(
      buildConfiguratorSeed()
        .filter((row) => row.group === "RC-751")
        .map(canonicalSeedItem),
      [storedItem],
    );
    const rows = RC751_PRICE_TOOL_FIXTURE.map((row) => ({
      item_number: row.item_number,
      item_text_da: row.item_text_da,
      cost_price_dkk: String(row.cost),
      price_dkk: String(row.dkk),
      price_sek: String(row.sek),
      price_eur: String(row.eur),
    }));

    const preview = buildPreview(rows, canonical, "COST_ONLY", new Set(["410040"]));

    expect(preview).toHaveLength(7);
    expect(preview.every((row) => row.bucket === "update")).toBe(true);
    expect(preview.map((row) => row.item_number)).toEqual(
      RC751_PRICE_TOOL_FIXTURE.map((row) => row.item_number),
    );
    expect(preview.filter((row) => row.existingPersisted)).toHaveLength(1);
    expect(preview.flatMap((row) => row.changes).every((change) => change.field === "cost_price_dkk")).toBe(true);
  });

  it("er idempotent, når kostprisen allerede matcher", () => {
    const preview = buildPreview(
      [{ item_number: "410040", cost_price_dkk: "70000", price_dkk: "1" }],
      [storedItem],
      "COST_ONLY",
      new Set(["410040"]),
    );

    expect(preview[0]).toMatchObject({ bucket: "skip", changes: [] });
  });

  it("bevarer FULL_PRICE_LIST-kontrakten for de eksisterende tilladte felter", () => {
    const preview = buildPreview(
      [{
        item_number: "410040",
        item_text_da: "Ny tekst",
        cost_price_dkk: "72515.88",
        price_dkk: "168000",
        price_sek: "252000",
        price_eur: "22500",
      }],
      [storedItem],
      "FULL_PRICE_LIST",
      new Set(["410040"]),
    );

    expect(preview[0].bucket).toBe("update");
    expect(preview[0].changes.map((change) => change.field)).toEqual([
      "item_text_da",
      "cost_price_dkk",
      "price_dkk",
      "price_sek",
      "price_eur",
    ]);
  });

  it("håndhæver mode, whitelist og audit server-side", () => {
    const migration = readFileSync(
      "supabase/migrations/20261001163339_cost_only_canonical_product_resolution.sql",
      "utf8",
    );
    const costBranch = migration.slice(
      migration.indexOf("if import_mode = 'COST_ONLY' then"),
      migration.indexOf("new_item_text_da :=", migration.indexOf("if import_mode = 'COST_ONLY' then")),
    );

    expect(migration).toContain("import_mode not in ('COST_ONLY', 'FULL_PRICE_LIST')");
    expect(migration).toContain("Kostprisimport opretter aldrig nye produkter");
    expect(costBranch).toContain("from public.price_list_published");
    expect(costBranch).toContain("insert into public.price_list_items");
    expect(costBranch).toContain("CANONICAL_CONFIGURATOR");
    expect(costBranch).toContain("is_dirty");
    expect(costBranch).toContain("false");
    expect(costBranch).toContain("cost_price_dkk = new_cost_price_dkk");
    expect(costBranch).not.toMatch(/\n\s+price_dkk\s*=/);
    expect(costBranch).not.toMatch(/\n\s+item_text_da\s*=/);
    expect(costBranch).not.toMatch(/\n\s+price_dkk\s*,/);
    expect(costBranch).not.toMatch(/\n\s+item_text_da\s*,/);
    expect(migration).toContain("processed_count");
    expect(migration).toContain("machine_scope");
    expect(migration).toContain("changed_item_numbers");
  });

  it("viser adskilte workflows og en enkel cost-only handling i Backend UI", () => {
    const page = readFileSync("src/pages/backend/BackendPriceListsPage.tsx", "utf8");

    expect(page).toContain("1. Upload kostpriser");
    expect(page).toContain("3. Upload redigeret prisliste");
    expect(page).toContain("Importér kostpriser (${counts.update})");
    expect(page).toContain("Nuværende kostpris");
    expect(page).toContain("Ny kostpris");
    expect(page).toContain('importMode === "COST_ONLY"');
    expect(page).toContain('p.existing?.item_text_da || "—"');
    expect(page).toContain("Systemværktøjer");
    expect(page).toContain("Kostprisimport");
    expect(page).toContain("Fuld prislisteimport");
  });
});
