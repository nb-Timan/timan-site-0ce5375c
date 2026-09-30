import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/pages/crm/CrmDealerDetailPage.tsx", "utf8");

describe("Partnerdata machine demo status presentation", () => {
  it("shows the canonical demo classification before extended warranty", () => {
    const demoHeader = 'label={tl("demo_machine", lang)} sortKey="status" sentenceCase';
    const warrantyHeader = 'normal-case">{tl("extended_warranty", lang)}</th>';

    expect(page).toContain(demoHeader);
    expect(page).toContain(warrantyHeader);
    expect(page.indexOf(demoHeader)).toBeLessThan(page.indexOf(warrantyHeader));
    expect(page).toContain('row.machineKind === "demo" ? "Demo" : tl("normal_machine", lang)');
  });

  it("only exposes the canonical lifecycle in the demo-only view", () => {
    expect(page).toContain('{demoOnly && <SortHeader label={tl("demo_status", lang)} sortKey="lifecycle" sentenceCase />}');
    expect(page).toContain("{demoOnly && (");
    expect(page).not.toContain('tl("lifecycle_status", lang)');
    expect(page).not.toContain('da: "Lifecycle-status"');
  });

  it("keeps table and overview lifecycle rendering on the same helper", () => {
    expect(page.match(/crmLifecycleMeta\(row, lang\)/g)).toHaveLength(2);
  });

  it("provides sentence-case labels in all nine portal languages", () => {
    for (const label of [
      "Demo-maskine", "Demo machine", "Demomaschine", "Macchina demo", "Demógép",
      "Demomaskin", "Machine de démonstration", "Maszyna demonstracyjna", "Předváděcí stroj",
      "Demo-status", "Demo status", "Demo-Status", "Stato demo", "Demó állapota",
      "Demostatus", "Statut de démonstration", "Status maszyny demonstracyjnej", "Stav předváděcího stroje",
    ]) expect(page).toContain(label);
    expect(page).toContain('sentenceCase ? "normal-case" : ""');
  });

  it("preserves responsive overflow and role-gated financial columns", () => {
    expect(page).toContain('<div className="overflow-x-auto">');
    expect(page).toContain("{showCommercials && <SortHeader");
    expect(page).toContain("{showBackendMargins && <>");
    expect(page).toContain("includeBackendMargins: showBackendMargins");
  });
});
