import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXTENDED_WARRANTY_PRODUCT_IDS,
  hasExtendedWarranty,
  isExtendedWarrantyProductId,
} from "@/lib/extendedWarranty";

const page = readFileSync("src/pages/crm/CrmDealerDetailPage.tsx", "utf8");
const registryService = readFileSync("src/lib/machineRegistryPageService.ts", "utf8");
const dealerService = readFileSync("src/lib/dealerMachineRegisterService.ts", "utf8");
const importService = readFileSync("src/lib/legacyMachineImportService.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260930161520_partnerdata_machine_financial_security_extended_warranty.sql",
  "utf8",
);
const portalResolutionMigration = readFileSync(
  "supabase/migrations/20260930163602_fix_extended_warranty_portal_model_unit_resolution.sql",
  "utf8",
);

describe("Partnerdata machine financial security", () => {
  it("keeps cost and contribution amount behind backend RLS and out of direct warranty selects", () => {
    expect(migration).toContain("machine_financial_margins_backend_select");
    expect(migration).toContain("using (public.is_timan_backend())");
    expect(migration).toContain("revoke select on public.warranty_registrations from authenticated");
    expect(migration).toContain("a.attname not in ('legacy_cost_amount', 'legacy_contribution_margin_amount')");
    expect(migration).toContain("'costAmount', null, 'contributionMarginAmount', null");
  });

  it("preserves revenue and server-computed contribution percentage for internal seller scope", () => {
    expect(migration).toContain("machine_financial_percentages_internal_select");
    expect(migration).toContain("actor.portal_role = 'timan_seller'");
    expect(migration).toContain("wr.dealer_account_id in (select public.warranty_visible_dealer_ids())");
    expect(registryService).toContain("p_include_backend_margins: input.includeBackendMargins ?? false");
    expect(page).toContain("formatPercent(row.contributionMarginPercent)");
  });

  it("shows backend-only columns only in backend mode, never Seller View-as", () => {
    expect(page).toContain('portalRole === "timan_backend" && !sellerViewActive');
    expect(page).toContain("{showBackendMargins && <>");
    expect(page).toContain("includeBackendMargins: showBackendMargins");
  });
});

describe("canonical extended warranty detection", () => {
  it("uses every current stable Configurator product id", () => {
    expect(EXTENDED_WARRANTY_PRODUCT_IDS).toEqual(["795015", "795016", "795018"]);
    for (const id of EXTENDED_WARRANTY_PRODUCT_IDS) expect(isExtendedWarrantyProductId(id)).toBe(true);
    expect(isExtendedWarrantyProductId("795002")).toBe(false);
  });

  it("renders one server-provided machine-level boolean without browser-side line scanning", () => {
    expect(hasExtendedWarranty({ hasExtendedWarranty: true })).toBe(true);
    expect(hasExtendedWarranty({ hasExtendedWarranty: false })).toBe(false);
    expect(dealerService).toContain("hasExtendedWarranty: row.hasExtendedWarranty === true");
    expect(page).toContain("hasExtendedWarranty(row)");
    expect(page).not.toContain("795015");
    expect(page).not.toContain("795016");
    expect(page).not.toContain("795018");
  });

  it("supports exact C5 evidence and only deterministic Portal machine/unit links", () => {
    expect(importService).toContain('"forlænget garanti varenr.": "extendedWarrantyItemNumber"');
    expect(importService).toContain('"portal-ordrenr.": "portalOrderNumber"');
    expect(migration).toContain("extended_warranty_source = 'c5_erp'");
    expect(migration).toContain("extended_warranty_source = 'portal_configuration'");
    expect(migration).toContain("configurationUnitKey");
    expect(portalResolutionMigration).toContain("coalesce(sum(greatest(coalesce(ci.machine_qty, 0), 0)), 0)");
    expect(portalResolutionMigration).toContain("public.is_canonical_extended_warranty_product(products.item_number, ci.machine_type)");
    expect(migration).toContain("v_warranty_ambiguous := v_warranty_ambiguous + 1");
  });

  it("maps all supported models to their machine-specific item number", () => {
    expect(migration).toContain("when '795015'");
    expect(migration).toContain("like '%RC751%'");
    expect(migration).toContain("when '795016'");
    expect(migration).toContain("like '%RC1000%'");
    expect(migration).toContain("when '795018'");
    expect(migration).toContain("like '%3330%'");
  });

  it("provides the label and accessible tooltip in all nine portal languages", () => {
    for (const text of [
      "Forlænget garanti",
      "Extended warranty",
      "Garantieverlängerung",
      "Garanzia estesa",
      "Kiterjesztett garancia",
      "Förlängd garanti",
      "Garantie prolongée",
      "Przedłużona gwarancja",
      "Prodloužená záruka",
    ]) expect(page).toContain(text);
    expect(page).toContain('aria-label={tl("extended_warranty_registered", lang)}');
  });

  it("adds no browser N+1 query", () => {
    expect(registryService.match(/supabase\.rpc\("machine_registry_page_scoped"/g)).toHaveLength(1);
    expect(dealerService).not.toContain("configuration_items");
    expect(page).not.toContain("configuration_items");
  });
});
