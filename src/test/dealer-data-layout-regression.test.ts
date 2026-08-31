import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dealerDataSource = fs.readFileSync(
  path.resolve(process.cwd(), "src/pages/portal/DealerDataPage.tsx"),
  "utf8",
);

const dealerProfileSource = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/portal/DealerProfileEditor.tsx"),
  "utf8",
);

describe("Partnerdata layout regression guard", () => {
  it("keeps CRM-style tabs and demo machines out of Partnerdata", () => {
    expect(dealerDataSource).not.toContain("TabsList");
    expect(dealerDataSource).not.toContain("TabsTrigger");
    expect(dealerDataSource).not.toContain("DemoMachinesWidget");
    expect(dealerDataSource).not.toContain("MachineRegisterTable");
    expect(dealerDataSource).not.toContain("dealerMachineRegisterService");
  });

  it("renders the dealer profile editor directly when a partner is loaded", () => {
    expect(dealerDataSource).toContain("<DealerProfileEditor");
    expect(dealerDataSource).not.toContain("value=\"machines\"");
    expect(dealerDataSource).not.toContain("value=\"documents\"");
    expect(dealerDataSource).not.toContain("value=\"overview\"");
  });

  it("keeps social and marketing fields inside the Marketing section", () => {
    const companyIndex = dealerProfileSource.indexOf('skey="company"');
    const marketingIndex = dealerProfileSource.indexOf('skey="marketing"');
    const websiteIndex = dealerProfileSource.indexOf('id="website"');
    const facebookIndex = dealerProfileSource.indexOf('id="social_facebook"');
    const digitalChannelsIndex = dealerProfileSource.indexOf('digitalChannels');

    expect(companyIndex).toBeGreaterThan(-1);
    expect(marketingIndex).toBeGreaterThan(-1);
    expect(websiteIndex).toBeGreaterThan(marketingIndex);
    expect(facebookIndex).toBeGreaterThan(marketingIndex);
    expect(digitalChannelsIndex).toBeGreaterThan(marketingIndex);
  });

  it("uses first contact as the user-facing primary contact marker", () => {
    expect(dealerProfileSource).toContain('t("firstContact")');
    expect(dealerProfileSource).not.toContain('primaryLabel={t("area_primary")}');
  });

  it("renders legacy first contacts through the shared editable contact list", () => {
    expect(dealerProfileSource).toContain("mergeLegacyContacts");
    expect(dealerProfileSource).toContain("role_title: t(source.roleKey)");
    expect(dealerProfileSource).not.toContain("function ProfileContactBlock");
    expect(dealerProfileSource).not.toContain('id="director_email"');
    expect(dealerProfileSource).not.toContain('id="marketing_contact_email"');
    expect(dealerProfileSource).not.toContain('firstContactNumber={2}');
  });

  it("shows one editable placeholder contact per department without saving empty rows", () => {
    expect(dealerProfileSource).toContain("ensureMinimumAreaContacts");
    expect(dealerProfileSource).toContain("if (!next.some((contact) => contact.contact_area === area))");
    expect(dealerProfileSource).toContain("if (isLocalContact(c) && !contactHasContent(c)) return { ok: true };");
    const contactHasContentBody = dealerProfileSource.slice(
      dealerProfileSource.indexOf("function contactHasContent"),
      dealerProfileSource.indexOf("type LegacyContactSource"),
    );
    expect(contactHasContentBody).not.toContain("contact.is_primary");
    expect(dealerProfileSource).not.toContain("contacts.length === 0 &&");
  });
});
