import { describe, expect, it } from "vitest";
import {
  buildBudgetReferenceCrmOptions,
  filterBudgetReferenceLeadsForDealer,
} from "@/lib/budgetReferenceCrmOptions";
import type { CrmDemoLead, CrmLead } from "@/lib/crmLeadsService";

const lead: CrmLead = {
  id: "lead-row-id", lead_no: 1023, title: "Weed brush", owner_user_id: null, owner_name: null,
  linked_dealer_id: "10368", first_contact_date: null, expected_close_date: null, next_followup_date: null,
  machine_types: [], next_activity: null, demo_has_run: null, contact_type: null, customer_type: null,
  contact_information: null, trade_fair: null, country: null, notes: null, estimated_value: null,
  probability: null, pipeline_stage: "followup", lost_competitor: null, lost_reason: null,
  lost_comment: null, attachments: [], status: "Åben", created_at: "2026-09-10T10:00:00.000Z",
  updated_at: "2026-09-10T10:00:00.000Z",
};

const demo: CrmDemoLead = {
  id: "demo-row-id", demo_no: 1044, title: "Demo RC-1000s", owner_user_id: null, owner_name: null,
  dealer_company: "A. Amrhein & Söhne", dealer_rep: null, customer_name: null, customer_address: null,
  notes: null, machine_category: [], demo_machine: "RC-1000s", demo_equipment: [], demo_date: null,
  interest_level: null, wants_offer: null, followup_date: null, estimated_value: null, probability: null,
  competitors_present: null, competitor_name: null, notes_after_demo: null, result_status: null,
  attachments: [], created_at: "2026-09-10T10:00:00.000Z",
};

describe("budget reference lead/demo options", () => {
  it("combines canonical lead and demo references in one dropdown model", () => {
    expect(buildBudgetReferenceCrmOptions([lead], [demo])).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "lead:L-1023", kind: "lead", label: "L-1023 · Weed brush · Åben" }),
      expect.objectContaining({ value: "demo:D-1044", kind: "demo", label: "D-1044 · Demo RC-1000s · Demo" }),
    ]));
  });

  it("keeps the source kind so existing lead and demo persistence stay separate", () => {
    const options = buildBudgetReferenceCrmOptions([lead], [demo]);
    expect(options.find((option) => option.value === "lead:L-1023")?.reference).toBe("L-1023");
    expect(options.find((option) => option.value === "demo:D-1044")?.reference).toBe("D-1044");
  });

  it("matches leads using either the canonical dealer UUID or legacy account number", () => {
    const uuidLinked = { ...lead, id: "uuid-linked", lead_no: 5002, linked_dealer_id: "dealer-uuid" };
    const accountNumberLinked = { ...lead, id: "account-linked", linked_dealer_id: "10368" };
    const otherDealer = { ...lead, id: "other-dealer", linked_dealer_id: "another-dealer" };

    expect(filterBudgetReferenceLeadsForDealer(
      [uuidLinked, accountNumberLinked, otherDealer],
      "dealer-uuid",
      "10368",
    ).map((item) => item.id)).toEqual(["uuid-linked", "account-linked"]);
    expect(buildBudgetReferenceCrmOptions([uuidLinked], [])[0]?.label).toContain("G-5002");
  });
});
