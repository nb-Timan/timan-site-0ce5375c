import { describe, expect, it } from "vitest";
import {
  CRM_DEMO_LEAD_SUMMARY_SELECT,
  CRM_LEAD_SUMMARY_SELECT,
} from "@/lib/crmLeadsService";

function columns(select: string): Set<string> {
  return new Set(select.split(",").map((x) => x.trim()).filter(Boolean));
}

function payloadSize(row: Record<string, unknown>, select: string): number {
  const picked: Record<string, unknown> = {};
  for (const col of columns(select)) picked[col] = row[col];
  return JSON.stringify(picked).length;
}

describe("CRM read payload performance", () => {
  it("keeps CRM lead summary fields needed for identical overview/KPI results", () => {
    const cols = columns(CRM_LEAD_SUMMARY_SELECT);

    expect([...cols]).toEqual([
      "id",
      "lead_no",
      "title",
      "owner_user_id",
      "owner_name",
      "owner_email",
      "linked_dealer_id",
      "first_contact_date",
      "expected_close_date",
      "next_followup_date",
      "machine_types",
      "next_activity",
      "demo_has_run",
      "contact_type",
      "customer_type",
      "contact_information",
      "country",
      "estimated_value",
      "pipeline_value_snapshot",
      "pipeline_value_snapshot_reason",
      "pipeline_value_snapshot_updated_at",
      "probability",
      "pipeline_stage",
      "lost_competitor",
      "lost_reason",
      "status",
      "move_to_working_qty",
      "converted_demo_lead_id",
      "incomplete_from_configurator",
      "created_at",
      "updated_at",
    ]);
    expect(cols.has("notes")).toBe(false);
    expect(cols.has("attachments")).toBe(false);
    expect(cols.has("lost_comment")).toBe(false);
    expect(cols.has("trade_fair")).toBe(false);
  });

  it("keeps demo lead summary fields needed for identical overview/stat results", () => {
    const cols = columns(CRM_DEMO_LEAD_SUMMARY_SELECT);

    expect([...cols]).toEqual([
      "id",
      "demo_no",
      "legacy_id",
      "title",
      "owner_user_id",
      "owner_name",
      "owner_email",
      "dealer_company",
      "dealer_country",
      "customer_name",
      "machine_category",
      "demo_machine",
      "demo_equipment",
      "demo_date",
      "estimated_value",
      "probability",
      "result_status",
      "source_lead_id",
      "created_at",
    ]);
    expect(cols.has("notes")).toBe(false);
    expect(cols.has("notes_after_demo")).toBe(false);
    expect(cols.has("attachments")).toBe(false);
    expect(cols.has("customer_address")).toBe(false);
  });

  it("reduces transmitted lead payload without changing row count or KPI fields", () => {
    const fullLead = {
      id: "lead-1",
      lead_no: 1001,
      title: "Test lead",
      owner_user_id: "seller-1",
      owner_name: "TS",
      owner_email: "ts@timan.dk",
      linked_dealer_id: "dealer-1",
      first_contact_date: "2026-01-01",
      expected_close_date: "2026-03-01",
      next_followup_date: "2026-02-01",
      machine_types: ["RC-751", "CS200 Combi"],
      next_activity: "Offer sent to the customer",
      demo_has_run: "yes",
      contact_type: "Email",
      customer_type: "Municipality",
      contact_information: "Customer A",
      trade_fair: "Long free-text trade fair context".repeat(60),
      country: "DK",
      notes: "Long internal CRM note ".repeat(250),
      estimated_value: 125000,
      pipeline_value_snapshot: 125000,
      pipeline_value_snapshot_reason: "estimated_value",
      pipeline_value_snapshot_updated_at: "2026-01-02T00:00:00.000Z",
      probability: 70,
      pipeline_stage: "Offer sent",
      lost_competitor: null,
      lost_reason: null,
      lost_comment: "Long lost-comment history ".repeat(120),
      attachments: Array.from({ length: 8 }, (_, i) => ({
        name: `attachment-${i}.pdf`,
        size: 2500000,
        type: "application/pdf",
        storage_bucket: "crm-lead-attachments",
        storage_path: `lead-1/attachment-${i}.pdf`,
        uploaded_at: "2026-01-01T00:00:00.000Z",
      })),
      status: "open",
      move_to_working_qty: 1,
      converted_demo_lead_id: null,
      incomplete_from_configurator: false,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-03T00:00:00.000Z",
    };

    const before = JSON.stringify(fullLead).length;
    const after = payloadSize(fullLead, CRM_LEAD_SUMMARY_SELECT);

    expect(after).toBeLessThan(before * 0.3);
    expect(columns(CRM_LEAD_SUMMARY_SELECT).has("estimated_value")).toBe(true);
    expect(columns(CRM_LEAD_SUMMARY_SELECT).has("next_activity")).toBe(true);
    expect(columns(CRM_LEAD_SUMMARY_SELECT).has("pipeline_stage")).toBe(true);
    expect(columns(CRM_LEAD_SUMMARY_SELECT).has("move_to_working_qty")).toBe(true);
  });
});
