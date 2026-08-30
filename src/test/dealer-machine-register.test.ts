import { describe, expect, it } from "vitest";
import type { DealerAccount } from "@/lib/dealerAccountsService";
import type { DbWarrantyRegistration } from "@/lib/warrantyRegistrationsService";
import {
  addCalendarMonths,
  getDemoLifecycle,
  getDemoOverviewMachines,
  reconcileDealerMachineRows,
} from "@/lib/dealerMachineRegisterService";

const dealer = {
  id: "dealer-1",
  account_number: "1000",
  company_name: "Foras GmbH Zeven",
} as DealerAccount;

function warranty(overrides: Partial<DbWarrantyRegistration>): DbWarrantyRegistration {
  return {
    id: "wr-1",
    certificateNumber: "SP-101",
    source: "import",
    createdAt: "2026-01-01T00:00:00.000Z",
    submittedAt: "2026-01-01T00:00:00.000Z",
    language: "da",
    dealerName: "Foras GmbH Zeven",
    isDemo: "Nej",
    machineSerial: "RC-001",
    machineType: "RC-1000",
    replacementBrand: null,
    toolSerials: [],
    deliveryDate: "2026-01-01",
    customer: "Kunde A",
    customerAddress: "",
    postalCity: "",
    phone: "",
    confirmationEmail: "",
    comment: null,
    status: "active",
    dealerMatchStatus: "matched",
    dealerAccountId: "dealer-1",
    dealerAccountNumber: "1000",
    dealerNameSnapshot: "Foras GmbH Zeven",
    dealerOfficialName: "Foras GmbH Zeven",
    postalCode: null,
    city: null,
    country: null,
    sharepointItemId: null,
    sharepointFormId: 101,
    sharepointModifiedAt: null,
    sharepointCreatedAt: null,
    registrationDate: null,
    isActiveInSource: true,
    ...overrides,
  };
}

describe("dealer machine register", () => {
  it("adds nine calendar months from the delivery date", () => {
    expect(addCalendarMonths("2026-01-15", 9)).toBe("2026-10-15");
    expect(addCalendarMonths("2026-05-31", 9)).toBe("2027-02-28");
  });

  it("marks active demo machines with a countdown before nine months", () => {
    const status = getDemoLifecycle({
      isDemo: true,
      deliveryDate: "2026-01-01",
      warrantyRegistrationDate: null,
      today: "2026-06-01",
    });
    expect(status.lifecycle).toBe("active_demo");
    expect(status.demoSaleEligibleAt).toBe("2026-10-01");
    expect(status.daysRemaining).toBeGreaterThan(100);
  });

  it("marks demo machines ready for sale after nine months without warranty", () => {
    expect(getDemoLifecycle({
      isDemo: true,
      deliveryDate: "2026-01-01",
      warrantyRegistrationDate: null,
      today: "2026-10-02",
    }).lifecycle).toBe("ready_for_sale");
  });

  it("flags warranty registration before the allowed demo sale date", () => {
    const status = getDemoLifecycle({
      isDemo: true,
      deliveryDate: "2026-01-01",
      warrantyRegistrationDate: "2026-08-01",
      today: "2026-08-15",
    });
    expect(status.lifecycle).toBe("sold_early");
    expect(status.daysSoldEarly).toBe(61);
  });

  it("dedupes machines and warranties by serial number", () => {
    const rows = reconcileDealerMachineRows({
      dealer,
      today: "2026-06-01",
      machines: [{
        serial_number: "rc 001",
        machine_number: null,
        machine_type: "RC-1000",
        model: "RC 1000",
        dealer_account_id: "dealer-1",
        dealer_number: "1000",
        dealer_name: "Foras GmbH Zeven",
        customer_name: null,
        warranty_start_date: null,
        updated_at: null,
      }],
      warranties: [warranty({
        machineSerial: "RC-001",
        isDemo: "Ja",
        deliveryDate: "2026-01-01",
      })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].sources).toEqual(["machines", "warranty_registrations"]);
    expect(rows[0].machineKind).toBe("demo");
  });

  it("keeps early demo sales in the overview and hides correctly sold demos from the widget", () => {
    const rows = reconcileDealerMachineRows({
      dealer,
      today: "2026-12-01",
      warranties: [
        warranty({ id: "early", machineSerial: "RC-100", isDemo: "Ja", deliveryDate: "2026-01-01", registrationDate: "2026-08-01" }),
        warranty({ id: "ok", machineSerial: "RC-200", isDemo: "Ja", deliveryDate: "2026-01-01", registrationDate: "2026-10-02" }),
      ],
    });
    expect(rows.map((r) => r.lifecycle).sort()).toEqual(["sold_early", "sold_registered"]);
    expect(getDemoOverviewMachines(rows).map((r) => r.serial)).toEqual(["RC-100"]);
  });
});
