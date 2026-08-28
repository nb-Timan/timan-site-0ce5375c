import { describe, expect, it } from "vitest";
import { t } from "@/lib/i18n/translations";
import type { PortalUiLanguage } from "@/lib/portalLanguages";

const languages: PortalUiLanguage[] = ["da", "en", "de", "it", "hu", "sv", "fr", "pl", "cs"];

const keys = [
  "crmMyDealers",
  "crmMyPartners",
  "crmMyDealersSubtitle",
  "crmMyDealersPartnerSubtitle",
  "crmMyDealersSearch",
  "crmMyDealersLoading",
  "crmMyDealersTypeDealerCustomer",
  "crmMyDealersTypeServicePartner",
  "crmMyDealersMain",
  "crmMyDealersFilterMissingInfo",
  "crmMyDealersFilterCritical",
  "crmProfileMissingInfo",
  "crmProfileCritical",
  "crmProfileSectionCompany",
  "crmProfileFieldInvoiceEmail",
];

describe("CRM My dealers dynamic labels", () => {
  it("has translated presentation labels for every portal UI language", () => {
    for (const lang of languages) {
      for (const key of keys) {
        expect(t(key, lang), `${key} in ${lang}`).not.toBe(key);
      }
    }
  });

  it("renders the reported German labels without Danish fallbacks", () => {
    expect(t("crmMyDealersTypeDealerCustomer", "de")).toBe("Händlerkunde");
    expect(t("crmMyDealersFilterMissingInfo", "de")).toBe("Fehlende Informationen");
    expect(t("crmMyDealersFilterCritical", "de")).toBe("Kritisch");
    expect(t("crmMyDealersMain", "de")).toBe("Haupt");
    expect(t("crmMyDealersMain", "de")).not.toBe("Hoved");
  });
});
