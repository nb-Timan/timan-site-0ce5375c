import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildPreview,
  mergeCanonicalPriceItems,
  parsePriceCsv,
  parsePriceWorkbook,
  type PriceListItem,
} from "@/lib/priceListService";
import { buildConfiguratorSeed } from "@/lib/configuratorPriceSeed";
import { buildPriceWorkbookSheet, type PriceWorkbookRow } from "@/pages/backend/BackendPriceListsPage";
import { RC751_PRICE_TOOL_FIXTURE } from "@/test/fixtures/priceListRc751Roundtrip";

function workbookToArrayBuffer(ws: XLSX.WorkSheet) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Prisliste");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}

describe("parsePriceWorkbook", () => {
  const emptyTranslations = {
    item_text_en: "",
    item_text_de: "",
    item_text_it: "",
    item_text_hu: "",
    item_text_sv: "",
    item_text_fr: "",
    item_text_pl: "",
    item_text_cs: "",
  };

  it("eksporterer et professionelt workbook-layout med brugervenlige importbare headers", () => {
    const ws = buildPriceWorkbookSheet([
      { group: "RC-1000s", item_number: "100001", item_text_da: "Basis", ...emptyTranslations, cost_price_dkk: 500, price_dkk: 1000, price_sek: 1503.76, price_eur: 134.23 },
    ]);

    expect(ws["A1"]?.v).toBe("PRISLISTEVÆRKTØJ");
    expect(ws["A11"]?.v).toBe("Maskintype");
    expect(ws["B11"]?.v).toBe("Varenr.");
    expect(ws["C11"]?.v).toBe("Varetekst (DA)");
    expect(ws["D11"]?.v).toBe("Kostpris DKK");
    expect(ws["E11"]?.v).toBe("Nuværende pris DKK");
    expect(ws["F11"]?.v).toBe("Nuværende pris SEK");
    expect(ws["G11"]?.v).toBe("Nuværende pris EUR");
    expect(ws["H11"]?.v).toBe("Nuværende DB DKK");
    expect(ws["I11"]?.v).toBe("Nuværende DG %");
    expect(ws["J11"]?.v).toBe("Ny pris DKK");
    expect(ws["K11"]?.v).toBe("Prisændring %");
    expect(ws["L11"]?.v).toBe("Masseændring – skriv X");
    expect(ws["M11"]?.v).toBe("Ny pris DKK");
    expect(ws["N11"]?.v).toBe("Ny pris SEK");
    expect(ws["O11"]?.v).toBe("Ny pris EUR");
    expect(ws["P11"]?.v).toBe("Ny DB DKK");
    expect(ws["Q11"]?.v).toBe("Ny DG %");
    expect(ws["R11"]?.v).toBe("Note");
    expect(ws["S11"]?.v).toBe("Varetekst (GB)");
    expect(ws["T11"]?.v).toBe("Varetekst (DE)");
    expect(ws["Z11"]?.v).toBe("Varetekst (CZ)");
    for (const col of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      expect(String(ws[`${col}11`]?.v ?? "")).not.toContain("_");
    }
    expect(ws["H12"]?.v).toBe(250);
    expect(ws["I12"]?.v).toBe(0.25);
    expect(ws["P12"]?.v).toBe(250);
    expect(ws["Q12"]?.v).toBe(0.25);
    expect(ws["K12"]?.z).toBe("0.00%");
    expect(ws["!dataValidation"]).toBeUndefined();
    expect(ws["!autofilter"]?.ref).toBe("A11:Z12");
    expect(ws["!merges"]).toEqual(expect.arrayContaining([
      { s: { r: 9, c: 4 }, e: { r: 9, c: 8 } },
      { s: { r: 9, c: 9 }, e: { r: 9, c: 11 } },
      { s: { r: 9, c: 12 }, e: { r: 9, c: 16 } },
    ]));
  });

  it("læser den eksporterede prisliste-workbook og beregner round-trip ændringer", () => {
    const rows: PriceWorkbookRow[] = [
      { group: "RC-1000s", item_number: "100001", item_text_da: "Manuel pris", ...emptyTranslations, cost_price_dkk: 500, price_dkk: 1000, price_sek: "", price_eur: "" },
      { group: "RC-1000s", item_number: "100002", item_text_da: "Procent", ...emptyTranslations, cost_price_dkk: 500, price_dkk: 1000, price_sek: "", price_eur: "" },
      { group: "RC-1000s", item_number: "100003", item_text_da: "Masse X", ...emptyTranslations, cost_price_dkk: 500, price_dkk: 1000, price_sek: "", price_eur: "" },
      { group: "RC-1000s", item_number: "100004", item_text_da: "Uændret", ...emptyTranslations, cost_price_dkk: 500, price_dkk: 1000, price_sek: "", price_eur: "" },
      { group: "RC-1000s", item_number: "100005", item_text_da: "Masse lille x trimmet", ...emptyTranslations, cost_price_dkk: 500, price_dkk: 1000, price_sek: "", price_eur: "" },
    ];
    const ws = buildPriceWorkbookSheet(rows);
    ws["B6"] = { ...(ws["B6"] ?? {}), t: "n", v: 0.02 };
    ws["J12"] = { ...(ws["J12"] ?? {}), t: "n", v: 1200 };
    ws["K13"] = { ...(ws["K13"] ?? {}), t: "n", v: 0.01 };
    ws["L14"] = { ...(ws["L14"] ?? {}), t: "s", v: "X" };
    ws["M15"] = { ...(ws["M15"] ?? {}), t: "s", v: "" };
    ws["L16"] = { ...(ws["L16"] ?? {}), t: "s", v: " x " };
    const workbook = workbookToArrayBuffer(ws);

    const result = parsePriceWorkbook(workbook);

    expect(result.format).toBe("price_tool");
    expect(result.parseErrors).toEqual([]);
    expect(result.rows).toHaveLength(5);
    expect(result.rows[0]).toMatchObject({ item_number: "100001", price_dkk: "1200", price_sek: "1804.51", price_eur: "161.07" });
    expect(result.rows[1]).toMatchObject({ item_number: "100002", price_dkk: "1010", price_sek: "1518.8", price_eur: "135.57" });
    expect(result.rows[2]).toMatchObject({ item_number: "100003", price_dkk: "1020", price_sek: "1533.83", price_eur: "136.91" });
    expect(result.rows[3]).toMatchObject({ item_number: "100004", price_dkk: "1000", price_sek: "1503.76", price_eur: "134.23" });
    expect(result.rows[4]).toMatchObject({ item_number: "100005", price_dkk: "1020", price_sek: "1533.83", price_eur: "136.91" });
  });

  it("round-tripper RC-751-værktøjet uden at stole på formel-cache", () => {
    const ws = buildPriceWorkbookSheet(RC751_PRICE_TOOL_FIXTURE.map((row) => ({
      group: "RC-751",
      item_number: row.item_number,
      item_text_da: row.item_text_da,
      ...emptyTranslations,
      cost_price_dkk: row.cost,
      price_dkk: row.dkk,
      price_sek: "",
      price_eur: row.currentEur,
    })));

    for (let row = 12; row <= 18; row++) {
      for (const column of ["M", "N", "O", "P", "Q"]) {
        ws[`${column}${row}`] = { ...ws[`${column}${row}`], t: "n", v: 999999 };
      }
    }

    const result = parsePriceWorkbook(workbookToArrayBuffer(ws));

    expect(result).toMatchObject({
      format: "price_tool",
      parseErrors: [],
      settings: {
        sekRateDkkPer100: 66.5,
        eurRateDkkPer1: 7.45,
        standardDiscountPct: 0.25,
        massChangePct: 0,
      },
    });
    expect(result.rows).toHaveLength(7);
    for (const [index, expected] of RC751_PRICE_TOOL_FIXTURE.entries()) {
      expect(result.rows[index]).toMatchObject({
        item_number: expected.item_number,
        item_text_da: expected.item_text_da,
        cost_price_dkk: String(expected.cost),
        price_dkk: String(expected.dkk),
        price_sek: String(expected.sek),
        price_eur: String(expected.eur),
      });
    }
  });

  it("auto-detekterer standard CSV og XLSX uden at bruge prisværktøjsregler", () => {
    const csv = parsePriceCsv("item_number,item_text_da,cost_price_dkk,price_dkk,price_sek,price_eur\n410106,Lader,476,1500,2255.64,201.34");
    expect(csv).toMatchObject({ format: "standard", parseErrors: [] });
    expect(csv.rows[0]).toMatchObject({ item_number: "410106", price_sek: "2255.64", price_eur: "201.34" });

    const ws = XLSX.utils.aoa_to_sheet([
      ["varenr", "varetekst_da", "kostpris_dkk", "pris_dkk", "pris_sek", "pris_eur"],
      ["410106", "Lader", 476, 1500, 2255.64, 201.34],
    ]);
    const xlsx = parsePriceWorkbook(workbookToArrayBuffer(ws));
    expect(xlsx).toMatchObject({ format: "standard", parseErrors: [] });
    expect(xlsx.rows[0]).toMatchObject({ item_number: "410106", cost_price_dkk: "476", price_dkk: "1500", price_sek: "2255.64", price_eur: "201.34" });
  });

  it("løser alle syv varer mod canonical Configurator og viser 0 nye / 7 opdateringer", () => {
    const parsedRows = RC751_PRICE_TOOL_FIXTURE.map((row) => ({
      item_number: row.item_number,
      item_text_da: row.item_text_da,
      cost_price_dkk: String(row.cost),
      price_dkk: String(row.dkk),
      price_sek: String(row.sek),
      price_eur: String(row.eur),
    }));
    const rc751Seeds = buildConfiguratorSeed()
      .filter((row) => row.group === "RC-751")
      .map(seedItem);
    const persisted = [{
      ...rc751Seeds.find((row) => row.item_number === "410040")!,
      id: "stored-410040",
    }];
    const canonical = mergeCanonicalPriceItems(rc751Seeds, persisted);
    const preview = buildPreview(parsedRows, canonical, "FULL_PRICE_LIST", new Set(["410040"]));

    expect(RC751_PRICE_TOOL_FIXTURE.every((row) => canonical.some((item) => item.item_number === row.item_number))).toBe(true);
    expect(new Set(canonical.map((row) => row.item_number)).size).toBe(canonical.length);
    expect(preview).toHaveLength(7);
    expect(preview.filter((row) => row.bucket === "create")).toHaveLength(0);
    expect(preview.filter((row) => row.bucket === "update")).toHaveLength(7);
    expect(preview.find((row) => row.item_number === "410040")?.changes).toEqual(expect.arrayContaining([
      { field: "cost_price_dkk", oldValue: null, newValue: "72515.88" },
      { field: "price_sek", oldValue: null, newValue: "251879.7" },
      { field: "price_eur", oldValue: "22515", newValue: "22483.22" },
    ]));
    expect(preview.find((row) => row.item_number === "410106")).toMatchObject({
      bucket: "update",
      existingPersisted: false,
    });

    const afterImport = parsedRows.map((row) => priceItemFromImportedRow(row));
    expect(buildPreview(parsedRows, afterImport, "FULL_PRICE_LIST").every((row) => row.bucket === "skip")).toBe(true);
  });

  it("bevarer database-upsertens canonical varenummer-unikhed", () => {
    const migration = readFileSync("supabase/migrations/20260813110443_backend_price_lists_and_costs.sql", "utf8");
    expect(migration).toContain("item_number text not null unique");
    expect(migration).toContain("on conflict (item_number)");
  });
});

function seedItem(seed: ReturnType<typeof buildConfiguratorSeed>[number]): PriceListItem {
  return {
    id: `configurator-${seed.item_number}`,
    item_number: seed.item_number,
    renamed_from_item_number: null,
    item_text_da: seed.item_text_da,
    item_text_de: null,
    item_text_en: null,
    price_dkk: seed.price_dkk,
    price_eur: seed.price_eur,
    price_sek: seed.price_sek,
    cost_price_dkk: null,
    cost_price_source: null,
    cost_price_updated_at: null,
    updated_at: new Date(0).toISOString(),
    updated_by_email: null,
    is_dirty: false,
    last_published_at: null,
  };
}

function priceItemFromImportedRow(row: {
  item_number: string;
  item_text_da: string;
  cost_price_dkk: string;
  price_dkk: string;
  price_sek: string;
  price_eur: string;
}): PriceListItem {
  return {
    id: `stored-${row.item_number}`,
    item_number: row.item_number,
    renamed_from_item_number: null,
    item_text_da: row.item_text_da,
    item_text_de: null,
    item_text_en: null,
    price_dkk: Number(row.price_dkk),
    price_eur: Number(row.price_eur),
    price_sek: Number(row.price_sek),
    cost_price_dkk: Number(row.cost_price_dkk),
    cost_price_source: "import",
    cost_price_updated_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    updated_by_email: "qa@timan.dk",
    is_dirty: true,
    last_published_at: null,
  };
}
