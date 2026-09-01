import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("company contact info onboarding i18n", () => {
  const page = readProjectFile("src/pages/misc/CompanyContactInfoFormPage.tsx");
  const shell = readProjectFile("src/pages/misc/MiscPageShell.tsx");
  const copy = readProjectFile("src/lib/i18n/companyContactInfoTranslations.ts");
  const contactModel = readProjectFile("src/lib/dealerContactModel.ts");
  const profileEditor = readProjectFile("src/components/portal/DealerProfileEditor.tsx");

  it("uses global UI language copy instead of legacy hardcoded onboarding text", () => {
    expect(page).toContain("useLanguage");
    expect(page).toContain("getCompanyContactInfoCopy(uiLanguage)");
    expect(page).toContain("title={copy.title}");
    expect(page).toContain("subtitle={copy.subtitle}");
    expect(page).toContain("intro={copy.intro}");
    expect(page).not.toContain("const TITLE = 'Firma Information'");
    expect(page).not.toContain("Formularen kan udfyldes på to måder");
    expect(page).not.toContain("1. Firma information");
    expect(page).not.toContain("salesExtras");
    expect(page).not.toContain("workshop_parts");
  });

  it("provides onboarding copy for every portal UI language", () => {
    for (const language of ["da", "en", "de", "it", "hu", "sv", "fr", "pl", "cs"]) {
      expect(copy).toContain(`const ${language}: CompanyContactInfoCopy`);
    }

    expect(copy).toContain('title: "Ny samarbejdspartner"');
    expect(copy).toContain('subtitle: "Virksomheds- og kontaktoplysninger"');
    expect(copy).toContain("Udfyld virksomhedens oplysninger for at komme videre");
    expect(copy).toContain('"1. Firma & ledelse"');
    expect(copy).toContain('"3. Indkøb & logistik"');
    expect(copy).toContain('"7. Til sidst / gennemgang"');
    expect(copy).toContain('title: "New collaboration partner"');
    expect(copy).toContain('title: "Neuer Kooperationspartner"');
    expect(copy).toContain('title: "Nouveau partenaire de collaboration"');
  });

  it("aligns the form with the canonical Partnerdata shape", () => {
    expect(page).toContain('source_model: "partnerdata"');
    expect(page).toContain("dealer_account_patch");
    expect(page).toContain("dealer_contacts");
    expect(page).toContain("address_line_1");
    expect(page).toContain("invoice_email");
    expect(page).toContain("social_linkedin");
    expect(page).toContain("contact_area");
    expect(page).toContain("is_primary");
    expect(page).not.toContain("address_line_2:");
    expect(page).not.toContain("company: {");
    expect(page).not.toContain("media:");
  });

  it("reuses the shared Partnerdata contact role model", () => {
    expect(page).toContain("@/lib/dealerContactModel");
    expect(profileEditor).toContain("@/lib/dealerContactModel");
    expect(contactModel).toContain("ROLE_KEYS_SALES");
    expect(contactModel).toContain("ROLE_KEYS_FINANCE");
    expect(contactModel).toContain("CONTACT_AREA_CONFIG");
    expect(contactModel).toContain('area: "marketing"');
  });

  it("lets the shared misc page shell render subtitles when a page supplies one", () => {
    expect(shell).toContain("subtitle?: string");
    expect(shell).toContain("{subtitle &&");
  });
});
