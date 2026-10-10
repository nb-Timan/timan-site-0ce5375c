# Betalingsfilial — canonical economic relationship

Base: origin/main `395c2d61ed174f1d9a1bde073608712a64e7c6d3`, audit 2026-10-10.
This change ships the generic model/UI/tests. The migration is **not applied**;
no production proposal, account creation or relationship activation is executed.
No SharePoint cutover, Fabric/C5 writes, credentials or Lovable build credits.

## Why the financial edge is separate

Read-only inspection found that existing `resolve_collaboration_manager_accounts`
and older sales-dashboard scope functions traverse every active row in
`partner_account_relations`. Putting a financial edge there would expand
commercial access. The existing table therefore cannot safely support this new
kind without changing the commercial access architecture.

The scoped `partner_billing_relations` table is the canonical **economic** edge:

- Main partner: existing dealer_accounts UUID.
- Billing identity: exact C5 company/account number, optionally linked to an
  already existing dealer_accounts UUID. A C5-only firm needs no commercial account.
- `relation_type=billing_branch`, active state, approver UUID/date,
  source/reason, immutable identity, ended-by/date/reason.
- One active billing firm per main partner; one billing firm may serve multiple mains.
- No partner-role enum, login, app_user, CRM role, map pin, commercial parent or
  billing_account_id update is created by the economic edge.

History reuses **partner_account_relation_history**, with additive typed columns
for relation/action/version/request, financial source facts and company-name
snapshot. Existing service-partner audit rows and commercial relations remain
unchanged. ONE BUSINESS ATTRIBUTE PER COLUMN is preserved.

## Lifecycle/security

`partner_billing_change` is Backend-only and supports PROPOSE, ACTIVATE, END and
atomic SWITCH. Require a source and reason; activation/switch/end require explicit
confirmation. Optimistic main-partner versions, request idempotency, existing
sync lock, cross-main cycle lock and immutable audit protect concurrent changes.
Cycle detection uses account numbers even before a C5 billing firm gets a Portal UUID.

No browser/anonymous/service-role direct access to the financial table is granted.
`partner_billing_preview` checks actual authenticated identity and existing
can_manage_partner_admin_fields scope. External callers cannot read financial
details; no new commercial rights are implied. New financial history receives a
restrictive main-scope policy; it does not change access to legacy history rows.
Functions use a fixed search_path, explicit auth check and restricted execute ACL.
Account import, financial edge writes and permission changes are never coupled.

Only explicit Backend RPC decisions can change economic rows. Direct DML,
identity changes, historical updates/deletes and truncation are guarded. A failed
audit insert rolls back the whole switch. Fabric refresh modifies only the source,
never the approved edge or its lifecycle. Missing source accounts preserve
historical approval names and existing approval; refresh never reactivates an ended edge.

## Actual read-only audit: Integra

| Account | Current Portal | Current C5 | Invoice account |
| --- | --- | --- | --- |
| 10451 Integra Group Sp z o.o. | Importør, UUID 4272d57f-283f-4d27-bc2b-9c70ead7c077, BP | Type 1 | 10476 |
| 10953 Integra Service Sp. z o.o. | Servicepartner, UUID e82b8f96-cd7f-4dc5-a839-b7be28c04692, BP | Type 1 | Empty |
| 10476 NORD AUTOSERVICE Sp.Z.o.o.SP.K | **No Portal account** | Type 0 | Empty |

Existing active commercial relation:
`ae8eae8c-c292-41a9-b48b-2628b76813b4`, importer_has_service_partner,
10451 → 10953. It is preserved.

10451 currently has legacy parent_account_number=10476. This task does **not**
rewrite that production pointer. The Backend hierarchy uses the approved
importer/service edge to display Integra as Hovedpartner, with original account
objects preserved for editing. Display grouping is never a source for writeback.
Commercial filters and service badges use the same hierarchy definition.

Timan's statement and the invoice account are evidence for an explicit **proposal**
10451 → 10476, not automatic classification of C5 type 0. No approved economic
edge is asserted in production. Portal importør/service types remain unchanged
despite conflicting C5 type 1. Empty invoice fields remain empty/unresolved.

Full current account hashes (recheck after implementation):

- 10451: a420ec6f101fcd8b22e76d2a3fca3a33
- 10953: 3b3619fd2ef0d94c17356716ac992412
- 10374: 3a77d88f5c79989254751c6841c0e2d0
- 10267: 9ec039ccebe3f4e172ab404c545d2d23

All four hashes and the exact active service relation were rechecked unchanged
after implementation. Production still has no NORD dealer_account and no new
financial table; the migration and proposal remain held for explicit approval.

## TBS / Holmsland

- Portal/C5: TBS Maskinpower ApS **10374**, UUID
  f28f44fa-04ca-4d0e-aeaf-118764f1c1e6, Forhandler, EM.
- Valtec Holmsland **10267**, UUID ffe39a95-858d-4c9f-834a-298b4ee66ccc,
  Forhandler, EM. Existing commercial parent=10374; C5 invoice account=10374.
- C5's distinct **TBS Grindsted 10311i** has type 8 and invoice account **10000**
  (Maskinh. Indkøbsringen A/S, type 8). No Portal match exists for 10311i and no
  alias proves that it is 10374. The names must not be conflated.
- No TBS/Holmsland economic relation is created. Their actual commercial
  structure is preserved and covered by the focused grouping test.

## UI and deployment

One BillingBranchList renders approved economic rows in Partnerdata/CRM detail,
Backend Forhandlere and Partnernetværk, with its own Betalingsfilial badge and an
internal, bounded read-only financial detail dialog. Backend approval review
uses existing main-partner IDs and explicit C5 candidate selection; it never
defaults billing identity from invoice fields.

The new RPC may be unavailable before separate DB approval; the service treats
only missing-function errors as unavailable, displays no fabricated approval,
and disables the review save action. Other errors are not treated as successful
empty results. External/view-as and Academy contexts do not request the new
financial data. The Partner Map and commercial role model are unchanged.

## Exact production approval still required

1. Apply **only** `20261010180202_billing_branch_relations.sql`, after review of
   its additive schema/RPC/history restrictions. This creates no business relation
   or partner account. The migration is held locally in Git for approval.
2. Save a **PROPOSE** decision, not ACTIVATE:

```json
{
  "p_main_partner_id": "4272d57f-283f-4d27-bc2b-9c70ead7c077",
  "p_account_number": "10476",
  "p_action": "PROPOSE",
  "p_expected_version": 0,
  "p_reason": "Timan har oplyst, at NORD AUTOSERVICE håndterer fakturering for Integra. C5 konto 10451 har INVOICEACCOUNT 10476. Partnertype og kommerciel relation bevares.",
  "p_source": "Timan-oplysning + verificeret C5 INVOICEACCOUNT 10451 → 10476",
  "p_confirmed": false,
  "p_request_id": "NEW_UUID_PER_NEW_DECISION"
}
```

Re-read source, identities and current version immediately before saving; replace
request_id with a fresh UUID. The server verifies actual authenticated Backend
identity and source presence. No NORD dealer_account, login or map pin is needed.
Later ACTIVATE requires a separate explicit Backend approval. Do not change
10451's legacy pointer, other business data or the TBS/Holmsland relationship
as a side effect. No operation above has been executed against production.

## Verification and reproducibility

```powershell
node scripts/test-billing-branch-relations.mjs
node scripts/test-partner-cooperation.mjs
node scripts/test-fabric-partner-review.mjs
npx vitest run src/test/partner-billing-relations.test.tsx src/test/service-partner-parent-relation.test.ts src/test/partnerdata-list-first.test.ts src/test/crm-dealer-detail-scope.test.ts src/test/partner-account-types.test.ts src/test/partner-map-defaults.test.ts src/test/partner-management-register.test.ts src/test/academy-partnerdata-sandbox.test.ts src/test/loan-partner-combobox.test.tsx
node scripts/billing-branch-browser-fixture.mjs
```

SQL tests use isolated PGlite in the existing ignored node_modules/.cache/loans-sql
cache. Browser fixture: 127.0.0.1:5226, actual Backend page plus shared detail/list
panel under /partnerdata. It explicitly labels the approved financial relationship
as **local expected QA**, has no production connection and refuses mutations.
This is not evidence that production NORD approval exists.

Desktop 1280 / 390 px verified: canonical main/service/economic badges, expand,
internal detail popup, mobile review, bounded scroll and no new page overflow.
Baseline typecheck has 110 known errors; changed lines are normalized when comparing.
Scoped lint has 0 errors and 6 existing warnings in legacy detail/profile pages.
81 focused Vitest cases PASS, 36 financial SQL/lifecycle/RLS checks PASS, plus 79
existing cooperation and 75 existing review SQL/RLS checks PASS. Build and
git diff --check PASS; typecheck remains 110 baseline errors with 0 new errors.

## Scoped files

- supabase/migrations/20261010180202_billing_branch_relations.sql
- src/lib/partnerBillingRelations.ts
- src/lib/partnerBillingRelationsService.ts
- src/components/portal/BillingBranchesPanel.tsx
- src/components/backend/BillingRelationReview.tsx
- src/pages/portal/DealerDataPage.tsx
- src/pages/crm/CrmDealerDetailPage.tsx
- src/pages/backend/BackendDealerAccountsPage.tsx
- src/pages/backend/BackendPartnerRelationsPage.tsx
- src/test/partner-billing-relations.test.tsx
- scripts/test-billing-branch-relations.mjs
- scripts/billing-branch-browser-fixture.mjs
- docs/partner-billing-branches.md
