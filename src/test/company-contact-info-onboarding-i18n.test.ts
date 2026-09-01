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

  it("uses global UI language copy instead of legacy hardcoded onboarding text", () => {
    expect(page).toContain("useLanguage");
    expect(page).toContain("getCompanyContactInfoCopy(uiLanguage)");
    expect(page).toContain("title={copy.title}");
    expect(page).toContain("subtitle={copy.subtitle}");
    expect(page).toContain("intro={copy.intro}");
    expect(page).not.toContain("const TITLE = 'Firma Information'");
    expect(page).not.toContain("Formularen kan udfyldes på to måder");
    expect(page).not.toContain("1. Firma information");
  });

  it("provides onboarding copy for every portal UI language", () => {
    for (const language of ["da", "en", "de", "it", "hu", "sv", "fr", "pl", "cs"]) {
      expect(copy).toContain(`${language}: {`);
    }

    expect(copy).toContain('title: "Ny samarbejdspartner"');
    expect(copy).toContain('subtitle: "Virksomheds- og kontaktoplysninger"');
    expect(copy).toContain("Udfyld virksomhedens oplysninger for at komme videre");
    expect(copy).toContain('"1. Virksomhed & ledelse"');
    expect(copy).toContain('title: "New collaboration partner"');
  });

  it("lets the shared misc page shell render subtitles when a page supplies one", () => {
    expect(shell).toContain("subtitle?: string");
    expect(shell).toContain("{subtitle &&");
  });
});
