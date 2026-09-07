import { describe, expect, it } from "vitest";
import { submissionBelongsToSeller, type PortalFormSubmission } from "@/lib/portalFormsService";

const submission: PortalFormSubmission = {
  id: "submission-1",
  created_at: "2026-09-07T00:00:00.000Z",
  form_type: "company_contact_info",
  dealer_account_number: null,
  dealer_name: "TJ Maskiner",
  submitted_by_user_id: "em-user-id",
  submitted_by_email: "em@timan.dk",
  payload: {},
  review_status: "pending",
  reviewed_at: null,
  reviewed_by_user_id: null,
  review_note: null,
  approved_dealer_account_id: null,
};

describe("pending partner seller scope", () => {
  it("matches the selected seller through canonical app_users ownership", () => {
    expect(submissionBelongsToSeller(submission, { ownerUserId: "em-user-id", ownerEmail: "em@timan.dk" })).toBe(true);
    expect(submissionBelongsToSeller(submission, { ownerUserId: "akr-user-id", ownerEmail: "akr@timan.dk" })).toBe(false);
  });

  it("uses the canonical submission email only when old rows lack app_users ownership", () => {
    expect(submissionBelongsToSeller({ ...submission, submitted_by_user_id: null }, { ownerUserId: "em-user-id", ownerEmail: "EM@timan.dk" })).toBe(true);
  });
});
