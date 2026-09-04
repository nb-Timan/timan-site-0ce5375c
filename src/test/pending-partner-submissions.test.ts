import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("pending partner submissions", () => {
  const migration = read("supabase/migrations/20260904095227_pending_partner_submission_approval.sql");
  const service = read("src/lib/portalFormsService.ts");
  const overview = read("src/pages/crm/CrmMyDealersPage.tsx");
  const panel = read("src/components/crm/PendingPartnerSubmissions.tsx");

  it("keeps onboarding submissions pending until Backend reviews them", () => {
    expect(migration).toContain("review_status text not null default 'pending'");
    expect(migration).toContain("check (review_status in ('pending', 'approved', 'returned', 'rejected'))");
    expect(migration).toContain("portal_form_submissions read seller onboarding own");
    expect(migration).toContain("portal_form_submissions insert company onboarding");
  });

  it("creates canonical partner data only through the Backend review transition", () => {
    expect(migration).toContain("review_company_contact_info_submission");
    expect(migration).toContain("portal_role = 'timan_backend'");
    expect(migration).toContain("insert into public.dealer_accounts");
    expect(migration).toContain("insert into public.dealer_contacts");
    expect(migration).toContain("Et kontonummer er påkrævet");
  });

  it("loads pending submissions from the canonical dealer overview", () => {
    expect(service).toContain("reviewCompanyContactInfoSubmission");
    expect(overview).toContain("PendingPartnerSubmissions");
    expect(overview).toContain('formType: "company_contact_info"');
    expect(panel).toContain("Afventer godkendelse");
    expect(overview).toContain("canReview={admin}");
  });

  it("merges pending partner submissions into the normal Partnerdata table", () => {
    expect(overview).toContain("PendingPartnerTableRow");
    expect(overview).toContain('row.review_status === "pending"');
    expect(overview).toContain("getPendingPartnerSubmissionDetails(row)");
    expect(overview).toContain("setSelectedPendingPartnerSubmission");
    expect(overview).toContain("Kontrakt ikke påbegyndt");
    expect(overview).toContain("renderList={false}");
    expect(overview).not.toContain("navigate(`/portal/crm/my-dealers/${row.id}`)");
  });
});
