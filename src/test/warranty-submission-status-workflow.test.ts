import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PORTAL_LANGUAGE_CODES } from "@/lib/portalLanguages";
import { warrantySubmissionStatusLabel } from "@/lib/warrantySubmissionStatus";

const migration = readFileSync(
  "supabase/migrations/20260914110935_warranty_submission_status_workflow.sql",
  "utf8",
);
const hardening = readFileSync(
  "supabase/migrations/20260914111137_harden_warranty_status_history_trigger_privileges.sql",
  "utf8",
);
const service = readFileSync("src/lib/warrantySubmissionsService.ts", "utf8");
const createService = readFileSync("src/lib/portalWarrantyRegistrationService.ts", "utf8");

describe("warranty submission status workflow", () => {
  it("matches the canonical live workflow and keeps one open serial per dealer", () => {
    expect(migration).toContain("'submitted', 'pending', 'needs_information', 'approved', 'rejected', 'cancelled'");
    expect(migration).toContain("warranty_submissions_one_open_serial_per_dealer");
    expect(migration).toContain("submission_status in ('submitted', 'pending', 'needs_information')");
  });

  it("records a scoped immutable timeline and restricts its trigger helper", () => {
    expect(migration).toContain("create table if not exists public.warranty_submission_status_history");
    expect(migration).toContain("warranty_submission_status_history_scoped_select");
    expect(migration).toContain("trg_warranty_submission_status_history");
    expect(hardening).toContain("revoke execute on function public.record_warranty_submission_status_history() from authenticated");
  });

  it("allows only the canonical review transitions and requires comments where needed", () => {
    expect(migration).toContain("v_submission.submission_status = 'submitted' and p_target_status = 'pending'");
    expect(migration).toContain("p_target_status in ('needs_information', 'rejected')");
    expect(migration).toContain("A comment is required for this status");
    expect(service).toContain("transition_portal_warranty_submission");
  });

  it("treats newly created warranty records as submitted, not the legacy pending state", () => {
    expect(createService).toContain('submissionStatus: "submitted"');
    expect(createService).toContain('row.submission_status !== "submitted"');
  });

  it("has a user-facing status label for every supported portal language", () => {
    const statuses = ["submitted", "pending", "needs_information", "approved", "rejected"] as const;
    for (const language of PORTAL_LANGUAGE_CODES) {
      for (const status of statuses) {
        expect(warrantySubmissionStatusLabel(status, language)).not.toHaveLength(0);
      }
    }
  });
});
