import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { t } from "@/data/translations";
import { buildConfiguratorPdf, buildConfiguratorPdfFilename } from "@/lib/configuratorPdf";
import type { CalcResult, ConfiguratorState, LineItem } from "@/types/configurator";

class NoRasterJsPDF extends jsPDF {
  addImage(): this {
    throw new Error("PDF test forbids raster document rendering");
  }
}

const baseState: ConfiguratorState = {
  step: 4,
  flowType: "quote",
  language: "da",
  machineConfigs: [],
  individualUnitConfigs: {},
  ralCodes: {},
  accQty: {},
  date: "2026-09-30",
  deliveryMethod: "send",
  deliveryDeliverStartup: null,
  manualDealerDiscountPct: 0,
  baseDiscountPct: 0.25,
  demoMachines: {},
  reqNumbers: {},
  currentMachineIndex: 0,
  firmanavn: "Test Partner A/S",
  kontaktperson: "Test Kontakt",
  telefon: "12345678",
  email: "test@example.com",
  emailRecipient: "kunde@example.com",
  comment: "Kort kundekommentar",
  internalNote: "",
  paymentTerms: "Standard NET21",
};

function makeCalcResult(machineCount: number, rowsPerMachine: number): CalcResult {
  const lineItems: LineItem[] = [];
  let subtotal = 0;

  for (let machine = 1; machine <= machineCount; machine++) {
    const machinePrice = 100000;
    subtotal += machinePrice;
    lineItems.push({
      txt: `Maskine ${machine} (Timan 3330)`,
      price: machinePrice,
      varenr: `M-${machine}`,
      bold: true,
      isMachine: true,
      index: machine,
    });

    for (let row = 1; row <= rowsPerMachine; row++) {
      const price = 1250 + row;
      subtotal += price;
      lineItems.push({
        txt: `- Lang tilvalgslinje ${row} med ekstra tekst, så beskrivelsen skal wrappe pænt i PDF-tabellen uden clipping`,
        price,
        varenr: `A-${machine}-${row}`,
        sub: true,
      });
    }

    lineItems.push({
      txt: `Subtotal Maskine ${machine}:`,
      price: machinePrice + rowsPerMachine * 1250 + (rowsPerMachine * (rowsPerMachine + 1)) / 2,
      varenr: "SUBTOTAL",
      subtotal: true,
      index: machine,
    });
  }

  return {
    lineItems,
    subtotal,
    discountDetails: [{ txt: "Grund rabat (25%)", amount: subtotal * 0.25 }],
    totalDiscount: subtotal * 0.25,
    currentPrice: subtotal * 0.75,
    totalPct: 25,
    qtyPct: 0,
  };
}

function buildTestPdf(flowType: "quote" | "order", calcResult: CalcResult) {
  return buildConfiguratorPdf({
    jsPDF: NoRasterJsPDF,
    state: { ...baseState, flowType },
    calcResult,
    flowType,
    quoteNumber: "T-1001",
    orderNumber: flowType === "order" ? "O-2001" : null,
    sourceQuoteNumber: null,
    showPrices: true,
    uiLanguage: "da",
    contentLanguage: "da",
    T: (key) => t(key, "da"),
    TC: (key) => t(key, "da"),
  });
}

describe("configurator PDF generator", () => {
  it("renders a short quote as structured PDF content without rasterizing the document", () => {
    const pdf = buildTestPdf("quote", makeCalcResult(1, 2));

    expect(pdf.getNumberOfPages()).toBe(1);
    expect(pdf.output("datauristring")).toContain("application/pdf");
  });

  it("flows a long order across multiple pages", () => {
    const pdf = buildTestPdf("order", makeCalcResult(3, 24));

    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  });

  it("flows a long quote across multiple pages", () => {
    const pdf = buildTestPdf("quote", makeCalcResult(3, 24));

    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  });

  it("builds stable quote and order filenames with reference numbers", () => {
    const date = new Date("2026-08-30T12:00:00");

    expect(buildConfiguratorPdfFilename({ flowType: "quote", refNumber: "T-1001", date, T: (key) => t(key, "da") }))
      .toBe("Timan_Tilbud_T-1001_2026-08-30.pdf");
    expect(buildConfiguratorPdfFilename({ flowType: "order", refNumber: "O-2001", date, T: (key) => t(key, "da") }))
      .toBe("Timan_Ordre_O-2001_2026-08-30.pdf");
  });
});
