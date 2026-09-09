import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("configurator order PDF flow", () => {
  it("reserves the canonical order number before building the PDF payload", () => {
    const source = readFileSync("src/pages/ConfiguratorPage.tsx", "utf8");
    const reserveNumber = source.indexOf("const reservedOrderNumber = await ensureOrderReferenceNumber(activeCaseId);");
    const buildPdf = source.indexOf("const pdf = buildConfiguratorPdf({", reserveNumber);

    expect(reserveNumber).toBeGreaterThan(-1);
    expect(buildPdf).toBeGreaterThan(reserveNumber);
    expect(source).toContain("sourceQuoteNumber: activeSourceQuoteNumber");
  });
});
