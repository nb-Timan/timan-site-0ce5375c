import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("CRM dealer detail i18n", () => {
  const crmDealerDetailPage = readProjectFile("src/pages/crm/CrmDealerDetailPage.tsx");
  const agreementHistory = readProjectFile("src/components/portal/PartnerAgreementHistory.tsx");

  it("uses global portal language for the add activity / note action", () => {
    expect(crmDealerDetailPage).toContain('add_activity_note:{ da: "Tilføj aktivitet / note", en: "Add activity / note", de: "Aktivität / Notiz hinzufügen"');
    expect(crmDealerDetailPage).toContain('fr: "Ajouter une activité / note"');
    expect(crmDealerDetailPage).toContain('{tl("add_activity_note", lang)}');
    expect(crmDealerDetailPage).not.toContain('{t("add_note")}');
  });

  it("keeps note actions and empty states on the same translation helper", () => {
    expect(crmDealerDetailPage).toContain('{tl("no_notes", lang)}');
    expect(crmDealerDetailPage).toContain('title={tl("edit_note", lang)}');
    expect(crmDealerDetailPage).toContain('title={tl("delete_note", lang)}');
    expect(crmDealerDetailPage).toContain('placeholder={tl("comment_add_placeholder", lang)}');
    expect(crmDealerDetailPage).toContain('{tl("comment_submit", lang)}');
    expect(crmDealerDetailPage).toContain('tl("share_with_dealer", lang)');
    expect(crmDealerDetailPage).toContain('tl("share_with_timan", lang)');
  });

  it("passes the global portal language into agreement history", () => {
    expect(crmDealerDetailPage).toContain("language={lang}");
    expect(crmDealerDetailPage).not.toContain("language={legacyLang}");
  });

  it("localizes agreement history controls without changing history data", () => {
    expect(agreementHistory).toContain("type AgreementLanguage = Language | PortalUiLanguage");
    expect(agreementHistory).toContain("addEvent: { da: 'Tilføj aftalehændelse', en: 'Add agreement event', de: 'Vertragsereignis hinzufügen'");
    expect(agreementHistory).toContain("fr: 'Ajouter un événement d’accord'");
    expect(agreementHistory).toContain("{ht('addEvent', language)}");
    expect(agreementHistory).toContain("{ht('eventType', language)}");
    expect(agreementHistory).toContain("{ht(option.labelKey, language)}");
    expect(agreementHistory).toContain("fetchPartnerAgreementHistory(dealerAccountNumber)");
  });
});
