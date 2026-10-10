# Reesink → Servicepartner: activation blocked

Audit date: 2026-10-10. Baseline origin/main:
`278ad7dcf3cca1d28ba940ca4951660079e49d85`.

Timan approved the intended access model and scoped implementation/tests.
**The concrete production relation is not approved for activation and is not
active. This audit is not a successful access-model acceptance test.**

## Verified identity and production boundary

| Partner | Account | UUID | Type | Seller |
|---|---|---|---|---|
| Reesink Turfcare A/S | 10151 | b6f4657a-6cc7-423d-b64d-dba372c96fd5 | Forhandler | EM |
| Have og Park Center Svendborg | 10082 | dcbfec99-6793-4d1c-bef6-c4219e1e4c6e | Servicepartner | EM |

Read-only production checks: both accounts active/unblocked, no relation touching
either account, #10082 cooperation version 0, no Portal users linked to either
account. Both parent and billing pointers are null. #10082's C5 INVOICEACCOUNT is
blank. Timan confirms direct billing; blank C5 evidence is displayed as blank,
not inferred or filled in.

No production SQL writes, migration application, relationship activation,
SharePoint cutover, user creation or access-role grants occurred in this audit.

The earlier approved migrations are already in the production registry:
`20261010202134 billing_branch_relations` and
`20261010202157 cooperation_independent_of_billing`.
Their repository files are `20261010180202_billing_branch_relations.sql` and
`20261010184027_cooperation_independent_of_billing.sql`.
Do not replay them to resolve the access gaps.

## Actual deployed access findings

The generic `resolve_collaboration_manager_accounts()` is reused by several
different RLS domains. It admits all active outgoing relations without a
relation-type-specific access contract.

| Check with an approved active Reesink collaboration manager | Actual result | Acceptance |
|---|---|---|
| Related quote/order reads | Allowed | Only partially sufficient: raw private fields also exposed |
| Unrelated dealer quote/order reads | Denied | PASS |
| Related serviceregistration/history reads | Allowed | PASS for this existing server-backed module |
| Unrelated serviceregistrations | Denied | PASS |
| Canonical Partnerdata list/detail resolver | Excludes #10082 | FAIL |
| Machine/warranty RLS | Excludes #10082 | FAIL |
| Internal configuration note / snapshot internalNote | Readable | FAIL |
| Unsubmitted configuration drafts | Readable | Outside the requested quote/order-only grant |
| Delete of a related configuration | Allowed by FOR ALL USING scope | FAIL |
| Related app_users row read | Allowed | Broader user-directory visibility needs a deliberate restriction |
| Update of related app_users row | Denied | No derived user-administration write grant |
| END removes derived quote/order/service/user-read scope | Revoked | PASS |
| END preserves accounts, UUIDs, seller, billing, C5 and frozen history | Preserved | PASS in isolated PostgreSQL |

The configuration policy's WITH CHECK protects insert/update checks; it does
**not** protect DELETE. A blanket assertion that existing WITH CHECK rules make
the expanded relation read-only would be incorrect.

Synthetic role matrix, all at account 10151 with organization_access_role
`collaboration_manager`: `timan_dealer`, `dealer_user`, `dealer_customer`,
`timan_importer` and `timan_service_partner` currently receive the same target
scope. `exhibition_user` does not. Own-company-only, inactive, unapproved,
unrelated-company and reverse-child users receive no target scope.
A role/account-kind mismatch must not become an unintended delegation path.

## Missing production service-case foundation

Read-only `to_regclass` checks returned NULL for:
`public.machines`, `public.service_tickets`, `public.service_claims`,
`public.machine_activity_log`, `public.machine_documents`.

The current code still references these sources:
- `src/lib/machineLifecycleService.ts`: machines, tickets, activities/documents.
- `src/lib/claimsService.ts`: service_claims, with local fallback.
- `src/lib/machineJournalService.ts`: composes server and browser-local sources.

Existing `warranty_registrations`, `warranty_submissions` and
`service_registrations` are present. They are not proof that the missing
service-ticket/claim sources exist or have server-side relation access.

`docs/sql/phase44_machine_lifecycle.sql` is an older manual foundation proposal,
not a verified deployed source. Applying its whole schema/helper/grant bundle
would exceed a small relation-scope correction and requires a separate review.
Browser-local claims/TSB are not acceptable evidence of server-side RLS or
immediate revocation.

Consequently this task cannot claim the complete approved Teknik & Service
scope is ready. No replacement hosting, data model or invented service-case
source was introduced.

## Reproducible isolated audit

Run in the repository:

```powershell
node scripts/test-partner-cooperation.mjs
node scripts/test-partner-cooperation.mjs --service-access-audit
```

The first command preserves the existing 118 lifecycle/RLS/history checks.
The second adds 33 negative acceptance observations in the same isolated
PGlite database, loading deployed SQL functions/policies from a dated,
credentials-free metadata fixture. It prints `BLOCKED`, access acceptance
`FAIL`, and exits **2**. Audit assertions passing means the blockers were
reproduced; it does not mean relation activation is approved.

All extra DDL and synthetic rows, including the exact two business UUIDs, are
rolled back. The existing authenticated Backend ACTIVATE/END/SWITCH RPC is
reused; no network calls or production credentials are loaded. Tests cover
both positive and negative reads, a DELETE probe in a savepoint, END revocation,
append-only history and whole-row/frozen-value integrity.
The seller-only helper in the fixture is a minimal synthetic dependency;
this external-user audit is not a complete seller/global-RLS certification.

Refresh the metadata evidence read-only after any relevant schema release.
Never label the old fixture as current production verification after changes.

## Required bounded remediation before a final activation approval

1. Confirm the existing operational service-ticket/claim source and its
   deployed server-side account/scope model. A missing source cannot be replaced
   by local fallback or by treating warranty registration as a service case.
2. Provide a relation-type-specific, role/account-validated read scope using
   the existing relation/lifecycle model. Preserve unrelated and legacy edges.
3. Make Partnerdata available read-only, separating profile maintenance from
   the related read projection. Exclude private financial/raw/internal fields.
4. Project sent/numbered quotes and submitted orders from their frozen data.
   Strip private notes; exclude unsent drafts. Do not grant relation-derived
   insert/update/delete or user administration.
5. Extend relevant machine/service reads through safe existing resolvers,
   with internal financials masked server-side and shared activities explicitly
   classified. Keep service writes governed by independent existing authority.
6. Test the approved role/account matrix, other Reesink roles, unrelated dealers,
   service cases, quote/order boundaries and END/SWITCH revocation.
7. Verify production billing/data/RLS are unchanged before requesting final
   activation approval. No final activation approval is requested while these
   controls fail.

## Validation of this audit change

- Existing cooperation SQL/RLS/history: 118 checks PASS; Fabric review: 75;
  billing branches: 36. Focused Vitest: 59 tests PASS across 10 files.
- Negative access audit: 33 observations reproduced; acceptance **FAIL**, exit 2.
- Script syntax, scoped JavaScript ESLint, production build and diff check PASS.
- Typecheck: 110 existing errors. Application, TypeScript configuration and
  dependency inputs are byte-for-byte unchanged from baseline origin/main;
  no new application/typecheck errors are introduced by these docs/MJS fixtures.
- A fresh read-only before/after integrity check of 40 business tables is
  identical, including account/user/contact, C5 review/relations, CRM,
  configurations, budgets, contracts and Loans data. Whole account checksums
  remain #10082 `d22085564c9a39c02ada453d26e99065` and
  #10151 `ca0491203181a2ed6da2cfcbd3ac5dda`.
- Supabase security advisors reviewed read-only. Existing search-path,
  extension, SECURITY DEFINER and password-protection warnings remain outside
  this audit; this is not a claim that production has no security findings.
- No UI changes or live Reesink-user browser certification: production has no
  users linked to these accounts and no active relation. No Lovable credits.
- Changed files are audit tooling, a schema/policy metadata fixture and
  documentation only. No release migration is added or applied.

## Future exact activation operation — NOT executable yet

Only after remediation and final explicit approval:
existing `partner_cooperation_change_typed`, action ACTIVATE,
customer UUID `dcbfec99-6793-4d1c-bef6-c4219e1e4c6e`,
parent UUID `b6f4657a-6cc7-423d-b64d-dba372c96fd5`,
type `dealer_has_service_partner`, expected version **rechecked** (currently 0),
explicit confirmation, one fresh idempotent request ID, authenticated authorized
Timan Backend actor, reason recording approved limited access, direct billing
and preserved EM.

Expected writes: one relation and one append-only approval event; no account,
billing, C5, user, quote/order or service-history rewrites. Recheck current
versions/relations before execution; never force an outdated version.
Rollback is an explicit END of the exact edge with current version and reason,
preserving commercial/service history. Do not delete audit or use C5 as a
relationship reset.
