import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parsePriceWorkbook } from "@/lib/priceListService";
import { buildPriceWorkbookSheet, type PriceWorkbookRow } from "@/pages/backend/BackendPriceListsPage";

function workbookToArrayBuffer(ws: XLSX.WorkSheet) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Prisliste");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}

describe("parsePriceWorkbook", () => {
  it("eksporterer et professionelt workbook-layout med brugervenlige importbare headers", () => {
    const ws = buildPriceWorkbookSheet([
      { group: "RC-1000s", item_number: "100001", item_text_da: "Basis", cost_price_dkk: 500, price_dkk: 1000, price_sek: 1503.76, price_eur: 134.23 },
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
    for (const col of "ABCDEFGHIJKLMNOPQR") {
      expect(String(ws[`${col}11`]?.v ?? "")).not.toContain("_");
    }
    expect(ws["H12"]?.v).toBe(250);
    expect(ws["I12"]?.v).toBe(0.25);
    expect(ws["P12"]?.v).toBe(250);
    expect(ws["Q12"]?.v).toBe(0.25);
    expect(ws["K12"]?.z).toBe("0.00%");
    expect(ws["!dataValidation"]).toBeUndefined();
    expect(ws["!autofilter"]?.ref).toBe("A11:R12");
    expect(ws["!merges"]).toEqual(expect.arrayContaining([
      { s: { r: 9, c: 4 }, e: { r: 9, c: 8 } },
      { s: { r: 9, c: 9 }, e: { r: 9, c: 11 } },
      { s: { r: 9, c: 12 }, e: { r: 9, c: 16 } },
    ]));
  });

  it("læser den eksporterede prisliste-workbook og beregner round-trip ændringer", () => {
    const rows: PriceWorkbookRow[] = [
      { group: "RC-1000s", item_number: "100001", item_text_da: "Manuel pris", cost_price_dkk: 500, price_dkk: 1000, price_sek: "", price_eur: "" },
      { group: "RC-1000s", item_number: "100002", item_text_da: "Procent", cost_price_dkk: 500, price_dkk: 1000, price_sek: "", price_eur: "" },
      { group: "RC-1000s", item_number: "100003", item_text_da: "Masse X", cost_price_dkk: 500, price_dkk: 1000, price_sek: "", price_eur: "" },
      { group: "RC-1000s", item_number: "100004", item_text_da: "Uændret", cost_price_dkk: 500, price_dkk: 1000, price_sek: "", price_eur: "" },
      { group: "RC-1000s", item_number: "100005", item_text_da: "Masse lille x trimmet", cost_price_dkk: 500, price_dkk: 1000, price_sek: "", price_eur: "" },
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

    expect(result.parseErrors).toEqual([]);
    expect(result.rows).toHaveLength(5);
    expect(result.rows[0]).toMatchObject({ item_number: "100001", price_dkk: "1200", price_sek: "1804.51", price_eur: "161.07" });
    expect(result.rows[1]).toMatchObject({ item_number: "100002", price_dkk: "1010", price_sek: "1518.8", price_eur: "135.57" });
    expect(result.rows[2]).toMatchObject({ item_number: "100003", price_dkk: "1020", price_sek: "1533.83", price_eur: "136.91" });
    expect(result.rows[3]).toMatchObject({ item_number: "100004", price_dkk: "", price_sek: "", price_eur: "" });
    expect(result.rows[4]).toMatchObject({ item_number: "100005", price_dkk: "1020", price_sek: "1533.83", price_eur: "136.91" });
  });
});
