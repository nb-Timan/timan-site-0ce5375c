# Loans return, cancellation and personnel history

Base: `e489c19287678a1f96d7531b5356f078b2d5958a` (origin/main, 10 October 2026).

## U-6608 and canonical lifecycle

Read-only production audit found U-6608 in `READY_FOR_REVIEW`, with two active
allocations, no frozen versions, no accepted acceptances and no returns. A
reservation does not prove physical checkout. The existing return resolver correctly
withholds **Modtag**; the missing UI was the authorized next review/acceptance step.

The overview and case detail now expose the existing acceptance route. It uses
`loan_create_case_version` and `loan_accept_case_version`, preserving their existing
permissions, immutable versions and approved-language-specific terms requirements.
No automatic checkout or receipt is introduced. The canonical statuses remain
`DRAFT`, `READY_FOR_REVIEW`, `AWAITING_ACCEPTANCE`, `ACCEPTED`, `ON_LOAN`,
`RETURN_INSPECTION`, `CLOSED_OK`, `CLOSED_WITH_DEVIATION` and `CANCELLED`.
Partial receipt is the existing return presentation state, not a new persisted status.

**Operational blocker:** production has no APPROVED loan terms. U-6608 cannot
progress until Timan supplies and approves the real terms and required translation.
No terms were invented, and no real loan was accepted, cancelled or received.

## Confirmation and historical identities

- Reuse `LoanCancelDialog` and `loan_cancel_unissued_case`; show the actual active
  reservation count from the scoped server resolver. Missing count blocks confirmation.
  Preserve the reason, expected update timestamp, request UUID and uncertain-result
  retry protection. Issued/accepted cases still require the canonical return flow.
- Partnerdata trash opens the existing AlertDialog primitive with contact name and
  partner. Cancellation does nothing. Confirmation calls the existing scoped contact
  operation, which now archives the contact instead of deleting its historical identity.
- Typed `removed_at` and `removed_by` columns record future contact removals. The
  remover is the actual app user, not the View-as identity. Historical contact UUIDs
  and loan references survive. New loan selection and canonical save replays reject
  archived contacts. A legacy archived canonical row suppresses active fallback;
  legacy partner fields remain intact.
- Contact removal never changes app_users, Auth, CRM, commercial snapshots or access.
  Empty unsaved UI placeholders have no persistent identity to archive.
- Backend Brugerstyring has a compact expandable history projection. Current status,
  known dates and actors come from app_users and existing audit events. Unknown dates
  and actors are **Ikke registreret**. Contact removal, login deactivation and account
  archival are separate. Historical events are not truncated at an arbitrary 500 rows.

## Applied migrations and security

Production migration registry and repository filenames match:

1. `20261010205018_loans_contact_lifecycle_history.sql`
2. `20261010205446_archived_contact_selection_guard.sql`
3. `20261010205842_personnel_history_complete_projection.sql`

All are additive schema/function support; they perform no business-data cleanup.
Existing scope/RLS policies and canonical access resolvers are unchanged. Two
restrictive contact policies hide archived contacts from active SELECT/UPDATE.
The Backend history RPC explicitly checks actual authenticated Backend identity.
Other projections reuse existing case/partner scope. New RPCs are not anonymously
executable and use a fixed empty search path. Existing contact-save/delete grants
and View-as rules are preserved.

Audit server provenance is database-stamped going forward. Browser input cannot
forge it. Server-recorded audit events are append-only; legacy provenance is marked
as unknown, without rewriting old events. Direct contact deletion/archival-field
tampering is blocked. Browser-role TRUNCATE is revoked only on contacts and audit,
because TRUNCATE bypasses row triggers/RLS. Removed-by identity uses a typed FK.
The Backend projection omits email/IP/credentials/permission payloads and raw labels
that can contain email. Archived contact details are not globally exposed.

Before/after count and normalized checksum comparisons matched for all **40** audited
business tables: users, partners/contacts, Loans/allocations/photos/versions/events/
returns/terms, configurations, CRM, Leads, budgets, contracts, Fabric partner review
and partner relations. No existing policy or canonical access resolver changed.
Production read-only tests deny an unregistered authenticated identity all new
Backend, partner-history and Loans-history access. Existing anonymous-executable
function warnings did not increase. Five intentional authenticated SECURITY DEFINER
RPCs are individually gated and tested; these generate advisory notices. Existing
unrelated security advisories are outside this change.

## Reproduce verification

Use Node 22 and the repository's existing dependencies. The PostgreSQL harness uses
the same isolated PGlite cache arrangement as the existing Loans return harness:

```powershell
npm install --prefix node_modules/.cache/loans-sql --no-save --ignore-scripts @electric-sql/pglite@0.5.8
node scripts/test-personnel-lifecycle.mjs
node scripts/test-loan-returns.mjs
npx vitest run src/test/personnel-lifecycle-ui.test.tsx src/test/loan-lifecycle.test.tsx src/test/loan-return-workflow.test.tsx src/test/loan-form-interaction.test.tsx src/test/loan-overview-info.test.tsx src/test/dealer-contact-hydration.test.ts src/test/dealer-contact-seller-rls.test.ts src/test/dealer-contact-resolver.test.ts src/test/academy-partnerdata-sandbox.test.ts src/test/app-users-security.test.ts src/test/admin-user-actions-session.test.ts
npx tsc --noEmit -p tsconfig.app.json
npm run build
git diff --check
node scripts/personnel-lifecycle-browser-fixture.mjs
```

The browser fixture mounts actual UI components with synthetic in-memory adapters,
no production credentials and a same-origin CSP. Visit its printed localhost URL.
Verify review, missing terms, issued/partial/full receipt controls, cancellation,
contact confirmation and Backend history at desktop and 390x844. SQL harness tests
the real migration functions/triggers/RLS; existing return tests cover physical
receipt, duplicate protection, photos, partial/full return and reservation integrity.
Browser simulations complement these database tests, not replace them.

Results: **136 UI/security tests PASS**, **42 PostgreSQL assertions PASS**, existing
Loans return integrity/RLS harness PASS, scoped lint **0 errors / 9 existing warnings**,
build PASS, script syntax PASS, diff check PASS. Typecheck remains blocked by **110
baseline errors**; comparison to origin/main found no new diagnostics after the
focused test fix. No unrelated type errors were edited.

Isolated browser acceptance passed desktop and 390px with no horizontal overflow.
Cancelling the dialogs retained the synthetic case/contact. Confirmation archived
only the selected synthetic contact and left its login unchanged. Issued and partial
loans had Modtag; fully received loans did not. No production mutation was used for QA.
After pushing, verify the actual Lovable preview by normal Git synchronization and
read-only/cancel-only checks. Do not trigger Lovable Build. Credits consumed: **0**.

## Scoped files

- `src/pages/loans/{LoansPage,LoanCasePage,LoanAcceptancePage,LoanCancelDialog,LoanNextAction}.tsx`
- `src/lib/{loanService,dealerContactsService,partnerDataRepository,dealerProfileI18n,backendPersonnelHistory}.ts`
- `src/lib/i18n/loanTranslations.ts`
- `src/components/portal/DealerProfileEditor.tsx`
- `src/components/backend/BackendPersonnelHistory.tsx`
- `src/pages/backend/BackendUsersPage.tsx`
- `src/test/{personnel-lifecycle-ui,loan-lifecycle,loan-form-interaction}.test.tsx`
- `src/test/dealer-contact-hydration.test.ts`
- `src/test/academy-partnerdata-sandbox.test.ts`
- `scripts/{test-personnel-lifecycle,personnel-lifecycle-browser-fixture}.mjs`
- The three migrations listed above and this document.
