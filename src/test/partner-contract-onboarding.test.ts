import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("partner contract onboarding access", () => {
  const migration = readProjectFile("supabase/migrations/20260831153956_partner_contract_access_windows_history.sql");
  const contractService = readProjectFile("src/lib/dealerContractsService.ts");
  const contractsPage = readProjectFile("src/pages/contracts/ContractsPage.tsx");
  const dealerDataPage = readProjectFile("src/pages/portal/DealerDataPage.tsx");
  const crmDealerDetailPage = readProjectFile("src/pages/crm/CrmDealerDetailPage.tsx");
  const historyComponent = readProjectFile("src/components/portal/PartnerAgreementHistory.tsx");
  const historyDetailMigration = readProjectFile("supabase/migrations/20260901081807_crm_partner_agreement_history_detail.sql");

  it("adds one controlled access-window model and append-only agreement history", () => {
    expect(migration).toContain("create table if not exists public.dealer_contract_access_windows");
    expect(migration).toContain("create table if not exists public.partner_agreement_history");
    expect(migration).toContain("expires_at > activated_at");
    expect(migration).toContain("expires_at <= activated_at + interval '8 hours'");
    expect(migration).toContain("alter table public.dealer_contract_access_windows enable row level security");
    expect(migration).toContain("alter table public.partner_agreement_history enable row level security");
    expect(migration).not.toContain("partner_agreement_history_update");
    expect(migration).not.toContain("partner_agreement_history_delete");
  });

  it("keeps external guided-contract draft access behind the active window", () => {
    expect(migration).toContain("create or replace function public.has_active_dealer_contract_window");
    expect(migration).toContain("create or replace function public.can_read_dealer_contract");
    expect(migration).toContain("dc.contract_status in ('awaiting_signed_upload', 'submitted_for_approval', 'changes_requested', 'approved', 'archived')");
    expect(migration).toContain("public.has_active_dealer_contract_window(coalesce(dc.dealer_account_id, da.id), dc.id)");
    expect(migration).toContain("create policy dealer_contracts_insert_controlled");
    expect(migration).toContain("and public.has_active_dealer_contract_window(dealer_account_id, null)");
  });

  it("records important contract events in Partnerdata history", () => {
    expect(migration).toContain("'contract_access_activated'");
    expect(migration).toContain("'contract_access_revoked'");
    expect(migration).toContain("'contract_review_completed'");
    expect(migration).toContain("'contract_received'");
    expect(migration).toContain("'contract_approved'");
    expect(migration).toContain("perform public.append_partner_agreement_history");
  });

  it("exposes access activation and history through existing frontend services", () => {
    expect(contractService).toContain("fetchActiveDealerContractAccessWindow");
    expect(contractService).toContain("activateDealerContractAccessWindow");
    expect(contractService).toContain("revokeDealerContractAccessWindow");
    expect(contractService).toContain("fetchPartnerAgreementHistory");
    expect(contractsPage).toContain("Åbn 1 time");
    expect(contractsPage).toContain("Åbn 2 timer");
    expect(contractsPage).toContain("Kontraktadgang er ikke aktiv");
    expect(dealerDataPage).toContain("PartnerAgreementHistory");
  });

  it("reuses agreement history on CRM dealer detail without exposing a generic activity feed", () => {
    expect(crmDealerDetailPage).toContain("PartnerAgreementHistory");
    expect(crmDealerDetailPage).toContain("xl:grid-cols-[minmax(440px,0.88fr)_minmax(520px,1.12fr)]");
    expect(crmDealerDetailPage).toContain("xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]");
    expect(crmDealerDetailPage).toContain("compact");
    expect(historyComponent).toContain("Tilføj aftalehændelse");
    expect(historyComponent).toContain("Åbn dokument");
    expect(historyComponent).toContain("fetchPartnerAgreementHistoryDocumentUrl");
    expect(historyComponent).toContain('compact ? "py-3"');
  });

  it("keeps CRM dealer detail topbar compact and orders quick cards consistently", () => {
    expect(crmDealerDetailPage).not.toContain("Company identity");
    expect(crmDealerDetailPage).not.toContain("xl:grid-cols-[minmax(220px,0.65fr)_minmax(0,2.35fr)]");
    expect(crmDealerDetailPage).toContain("xl:grid-cols-6");

    const contactIndex = crmDealerDetailPage.indexOf('key: "call"');
    const mailIndex = crmDealerDetailPage.indexOf('key: "mail"');
    const routeIndex = crmDealerDetailPage.indexOf('key: "route"');
    const webIndex = crmDealerDetailPage.indexOf('key: "web"');
    const dealerDataIndex = crmDealerDetailPage.indexOf('key: "dealer-data"');
    const sellerIndex = crmDealerDetailPage.indexOf('key: "assigned-seller"');

    expect(contactIndex).toBeGreaterThan(-1);
    expect(mailIndex).toBeGreaterThan(contactIndex);
    expect(routeIndex).toBeGreaterThan(mailIndex);
    expect(webIndex).toBeGreaterThan(routeIndex);
    expect(dealerDataIndex).toBeGreaterThan(webIndex);
    expect(sellerIndex).toBeGreaterThan(dealerDataIndex);
  });

  it("keeps manual agreement history creation scoped and append-only", () => {
    expect(historyDetailMigration).toContain("add column if not exists occurred_at");
    expect(historyDetailMigration).toContain("'collaboration_partner_added'");
    expect(historyDetailMigration).toContain("'service_partner_added'");
    expect(historyDetailMigration).toContain("'dealer_customer_added'");
    expect(historyDetailMigration).toContain("create or replace function public.create_partner_agreement_history_event");
    expect(historyDetailMigration).toContain("if not public.can_manage_dealer_contract_access(p_dealer_account_id)");
    expect(historyDetailMigration).toContain("raise exception 'forbidden'");
    expect(historyDetailMigration).toContain("revoke all on function public.append_partner_agreement_history");
    expect(historyDetailMigration).not.toContain("create policy partner_agreement_history_update");
    expect(historyDetailMigration).not.toContain("create policy partner_agreement_history_delete");
  });
});
