import { describe, expect, it } from "vitest";
import {
  formatDealerProfileBadgeLabel,
  type DealerProfileBadge,
} from "@/lib/dealerProfileBadge";
import { t } from "@/lib/i18n/translations";
import { DEFAULT_QUICK_ACTIONS } from "@/lib/backend-users-store";
import { PORTAL_AREAS } from "@/lib/portalAreas";
import type { PortalUiLanguage } from "@/lib/portalLanguages";

const languages: PortalUiLanguage[] = ["da", "en", "de", "it", "hu", "sv", "fr", "pl", "cs"];

const requiredKeys = [
  "portalImportantTag",
  "portalNewTag",
  "dealerProfileBadgeNotFilled",
  "dealerProfileBadgeNoDealers",
  "dealerProfileBadgeComplete",
  "dealerProfileBadgeCriticalPlural",
  "dealerProfileBadgeMissingInfo",
  "quickActionCreateLead",
  "quickActionCreateDemo",
  "quickActionCompanyContactInfo",
  "quickActionCompanyContactInfoDesc",
  "quickActionDealerInvoiceAccept",
  "quickActionPartnerMap",
  "area_calendar_title",
  "area_calendar_desc",
];

const criticalBadge: DealerProfileBadge = {
  total: 113,
  missing: 98,
  critical: 15,
  tone: "red",
  label: "15 kritiske · 98 mangler info",
  labelKind: "critical_missing",
};

describe("Portal front page dealer data badge i18n", () => {
  it("has required dealer-data badge labels for every portal language", () => {
    for (const lang of languages) {
      for (const key of requiredKeys) {
        expect(t(key, lang), `${key} in ${lang}`).not.toBe(key);
      }
    }
  });

  it("translates critical and missing-info labels while preserving counts", () => {
    expect(formatDealerProfileBadgeLabel(criticalBadge, "da")).toBe("15 kritiske · 98 mangler info");
    expect(formatDealerProfileBadgeLabel(criticalBadge, "en")).toBe("15 critical · 98 missing info");
    expect(formatDealerProfileBadgeLabel(criticalBadge, "de")).toBe("15 kritisch · 98 fehlende Informationen");
    expect(formatDealerProfileBadgeLabel(criticalBadge, "hu")).toBe("15 kritikus · 98 hiányzó információ");
  });

  it("uses portal changelog badge keys instead of legacy hardcoded labels", () => {
    expect(t("portalImportantTag", "hu").toUpperCase()).toBe("FONTOS");
    expect(t("portalImportantTag", "de").toUpperCase()).toBe("WICHTIG");
    expect(t("portalImportantTag", "en").toUpperCase()).toBe("IMPORTANT");
  });

  it("uses the fixed quick-action sets for internal and partner roles", () => {
    expect(DEFAULT_QUICK_ACTIONS.timan_seller).toEqual([
      "create_lead",
      "create_demo",
      "company_contact_info",
      "partner_map",
    ]);
    expect(DEFAULT_QUICK_ACTIONS.timan_backend).toEqual(DEFAULT_QUICK_ACTIONS.timan_seller);
    expect(DEFAULT_QUICK_ACTIONS.timan_dealer).toEqual([
      "create_lead",
      "create_demo",
      "dealer_invoice_accept",
      "partner_map",
    ]);
    expect(DEFAULT_QUICK_ACTIONS.timan_importer).toEqual(DEFAULT_QUICK_ACTIONS.timan_dealer);
    expect(DEFAULT_QUICK_ACTIONS.timan_service_partner).toEqual(DEFAULT_QUICK_ACTIONS.timan_dealer);
  });

  it("promotes calendar to a main portal area", () => {
    expect(PORTAL_AREAS.some((area) => area.id === "calendar")).toBe(true);
    expect(PORTAL_AREAS.find((area) => area.id === "salg_marketing")?.moduleIds).not.toContain("partner_map");
  });
});
