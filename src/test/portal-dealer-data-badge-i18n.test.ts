import { describe, expect, it } from "vitest";
import {
  formatDealerProfileBadgeLabel,
  type DealerProfileBadge,
} from "@/lib/dealerProfileBadge";
import { t } from "@/lib/i18n/translations";
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
});
