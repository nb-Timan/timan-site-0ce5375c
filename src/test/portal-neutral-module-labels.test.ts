import { describe, expect, it } from "vitest";
import { ROLE_PREVIEWS } from "@/lib/activeMode";
import { translations, t } from "@/lib/i18n/translations";
import { PORTAL_ROLE_LABELS } from "@/lib/portalAccess";
import { PORTAL_AREAS } from "@/lib/portalAreas";
import { PORTAL_LANGUAGE_CODES, type PortalUiLanguage } from "@/lib/portalLanguages";
import { findSystemMapNode } from "@/lib/systemDataflowMap";

const MESSE_TITLES: Record<PortalUiLanguage, string> = {
  da: "Messe",
  en: "Exhibition",
  de: "Messe",
  it: "Fiera",
  hu: "Kiállítás",
  sv: "Mässa",
  fr: "Salon",
  pl: "Targi",
  cs: "Veletrh",
};

describe("neutral portal module display labels", () => {
  it("uses CRM and neutral Messe names across all portal languages", () => {
    for (const lang of PORTAL_LANGUAGE_CODES) {
      expect(t("area_timan_crm_title", lang)).toBe("CRM");
      expect(t("portalMesseTitle", lang)).toBe(MESSE_TITLES[lang]);
      expect(t("portalMesseTitle", lang)).not.toMatch(/Timan/i);
      expect(translations[lang].messeHomeWelcome).not.toMatch(/Timan/i);
      expect(translations[lang].messeHomePreview).not.toMatch(/Timan/i);
    }
  });

  it("keeps canonical keys while changing visible labels", () => {
    const crmArea = PORTAL_AREAS.find((area) => area.id === "timan_crm");
    const rolePreview = ROLE_PREVIEWS.find((role) => role.key === "exhibition_user");

    expect(crmArea?.title.da).toBe("CRM");
    expect(rolePreview?.label).toBe("Messe");
    expect(PORTAL_ROLE_LABELS.exhibition_user.da).toBe("Messe");
    expect(findSystemMapNode("crm").title).toBe("CRM");
    expect(findSystemMapNode("messe").title).toBe("Messe");
  });
});
