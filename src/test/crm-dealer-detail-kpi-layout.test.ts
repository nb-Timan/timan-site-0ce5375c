import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/crm/CrmDealerDetailPage.tsx", "utf8");
const kpiStrip = source.slice(source.indexOf("function KpiStrip("), source.indexOf("// ============================================================================\n// ContactsList"));

describe("CRM dealer detail KPI layout", () => {
  it("shows compact centered KPI cards without the monthly activities card", () => {
    expect(kpiStrip).toContain("grid-cols-2 md:grid-cols-4");
    expect(kpiStrip).toContain("flex min-w-0 flex-col items-center justify-center p-2 text-center");
    expect(kpiStrip).toContain("mb-1 flex items-center justify-center gap-1.5");

    expect(kpiStrip).toContain('key: "orders"');
    expect(kpiStrip).toContain('key: "quotes"');
    expect(kpiStrip).toContain('key: "leads"');
    expect(kpiStrip).toContain('key: "pipeline"');
    expect(kpiStrip).not.toContain('key: "acts"');
    expect(kpiStrip).not.toContain("monthActs");
  });

  it("labels the combined lead KPI as open leads only while preserving demo count display", () => {
    expect(kpiStrip).toContain('key: "leads", label: tl("open_leads", lang)');
    expect(kpiStrip).not.toContain('label: `${tl("open_leads", lang)} + ${tl("demo_leads", lang)}`');
    expect(kpiStrip).toContain("{openDemos}");
    expect(kpiStrip).toContain('tl("demo_leads", lang).toLowerCase()');
  });
});
