import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("configurator order PDF flow", () => {
  it("reserves the canonical order number without persisting it before submission", () => {
    const source = readFileSync("src/pages/ConfiguratorPage.tsx", "utf8");
    const service = readFileSync("src/lib/configurationsService.ts", "utf8");
    const reserveNumber = source.indexOf("const reservedOrderNumber = await getNextCrmDocumentNumber('order');");
    const buildPdf = source.indexOf("const pdf = buildConfiguratorPdf({", reserveNumber);

    expect(reserveNumber).toBeGreaterThan(-1);
    expect(buildPdf).toBeGreaterThan(reserveNumber);
    expect(source).not.toContain("ensureOrderReferenceNumber");
    expect(source).toContain("orderNumber: activeOrderNumber");
    expect(service).toContain("existingOrderNumber || options?.orderNumber || await getNextCrmDocumentNumber('order')");
    expect(source).toContain("sourceQuoteNumber: activeSourceQuoteNumber");
  });
});
