import { describe, expect, it } from "vitest";
import type { DealerAccount } from "@/lib/dealerAccountsService";
import type { DealerContact } from "@/lib/dealerContactsService";
import {
  isLegacyViewContact,
  mergeLegacyContacts,
  shouldPersistContact,
} from "@/components/portal/DealerProfileEditor";

function contact(overrides: Partial<DealerContact> = {}): DealerContact {
  return {
    id: "canonical-contact-1",
    dealer_account_id: "dealer-avistech",
    contact_area: "director",
    role_title: "Direktør",
    name: "Roman Guichen",
    email: null,
    phone: "+420 602 118 106",
    is_primary: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const avistechLikeDealer = {
  id: "dealer-avistech",
  director_name: "Ing. Roman Guichen",
  finance_contact_name: null,
  finance_contact_email: null,
  finance_contact_phone: null,
  sales_contact_name: null,
  sales_contact_email: null,
  sales_contact_phone: null,
  workshop_contact_name: null,
  workshop_contact_email: null,
  workshop_contact_phone: null,
  marketing_contact_name: null,
  marketing_contact_email: null,
  marketing_contact_phone: null,
  primary_contact_name: null,
  primary_contact_email: null,
  primary_contact_phone: null,
} as DealerAccount;

const label = () => "Direktør";

describe("Partnerdata contact hydration", () => {
  it("never turns an unmatched legacy display row into a save candidate", () => {
    const hydrated = mergeLegacyContacts(avistechLikeDealer, [], label);
    const legacy = hydrated.find(isLegacyViewContact);

    expect(legacy).toMatchObject({
      contact_area: "director",
      name: "Ing. Roman Guichen",
    });
    expect(shouldPersistContact(legacy!)).toBe(false);
    expect(shouldPersistContact(contact())).toBe(true);
  });

  it("keeps a canonical contact row from being copied when all stable fields match", () => {
    const canonical = contact({ name: "Ing. Roman Guichen", phone: null });
    const hydrated = mergeLegacyContacts(avistechLikeDealer, [canonical], label);

    expect(hydrated).toEqual([canonical]);
    expect(hydrated.map((row) => row.id)).toEqual(["canonical-contact-1"]);
  });

  it("keeps canonical sections stable through three save and reload cycles", () => {
    const canonical = contact();
    let hydrated = [canonical];

    for (let cycle = 0; cycle < 3; cycle += 1) {
      hydrated = mergeLegacyContacts(avistechLikeDealer, hydrated, label);
      expect(hydrated).toEqual([canonical]);
      expect(hydrated.filter(shouldPersistContact)).toEqual([canonical]);
    }
  });

  it("uses canonical email in the same section when legacy phone data is stale", () => {
    const dealer = {
      ...avistechLikeDealer,
      director_name: null,
      workshop_contact_name: "Richard Mendl (service coordinator)",
      workshop_contact_email: "servis@avistech.cz",
    };
    const canonical = contact({
      id: "canonical-workshop",
      contact_area: "workshop",
      name: "Richard Mendl (service coordinator)",
      email: "servis@avistech.cz",
      phone: "+420 724 033 481",
    });

    expect(mergeLegacyContacts(dealer, [canonical], label)).toEqual([canonical]);
  });

  it("does not save empty local placeholders", () => {
    expect(shouldPersistContact(contact({
      id: "local-empty",
      name: null,
      email: null,
      phone: null,
      role_title: null,
    }))).toBe(false);
  });
});
