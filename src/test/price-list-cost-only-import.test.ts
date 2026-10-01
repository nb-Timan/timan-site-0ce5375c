import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPreview,
  buildPriceImportPayload,
  type CsvPriceRow,
  type PriceListItem,
} from "@/lib/priceListService";

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

  it("afviser ukendte og ikke-persisted varer uden at klassificere dem som nye", () => {
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
    expect(unknown[0].errorMessage).toContain("opretter aldrig nye varer");
    expect(configuratorOnly[0]).toMatchObject({ bucket: "error", existingPersisted: false });
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
      "supabase/migrations/20261001101403_separate_cost_only_price_import.sql",
      "utf8",
    );
    const costBranch = migration.slice(
      migration.indexOf("if import_mode = 'COST_ONLY' then"),
      migration.indexOf("new_item_text_da :=", migration.indexOf("if import_mode = 'COST_ONLY' then")),
    );

    expect(migration).toContain("import_mode not in ('COST_ONLY', 'FULL_PRICE_LIST')");
    expect(migration).toContain("Kostprisimport opretter aldrig nye varer");
    expect(costBranch).toContain("cost_price_dkk = new_cost_price_dkk");
    expect(costBranch).not.toMatch(/\n\s+price_dkk\s*=/);
    expect(costBranch).not.toMatch(/\n\s+item_text_da\s*=/);
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
