# Loans pre-launch QA archive — 2026-10-10

Timan explicitly approved ONLY U-6601 through U-6607 as synthetic cases, including U-6602 and U-6604. The operation ran against project `rdodyoixxybiozvmuqon` from origin/main `e386c876c670b1fdbad30fced39130eb529c56ec`. No Lovable Build was requested; credits consumed: 0.

## Exact approved scope and rollback evidence

| U-number | Case UUID | Original case checksum |
| --- | --- | --- |
| U-6601 | 40aac887-8ceb-44f8-ae5e-98ae906b4318 | 732dbd3e23a14409b4d38508b8a41df8 |
| U-6602 | 97dcaa42-ddf1-4a60-b38d-a57b1966387b | 8218db54a9211ceb5a526971d48d830b |
| U-6603 | 971c98c9-450e-410a-a44b-bb999d782350 | b5f76bec0d0be2ea536ea8c81277a3fa |
| U-6604 | cfc41c91-13d3-4829-8c91-d323309cbbb5 | cbc193b1e98ea6cf836b5030b80669f4 |
| U-6605 | f0801ee7-2bd5-41fb-80f8-79c38d3180f0 | 5f8bd39d09f13dac157c2cad279fec0f |
| U-6606 | 008c1e64-710d-40bc-8c15-f0dc1e3ac514 | e12fbbf998ad11c51df566eb5e6fab22 |
| U-6607 | 75ad47cf-b88b-48ac-b77b-7b6561e53e25 | 51900fedd8ee48a057000f67e9cf0b45 |

U-6608 (`80dde18b-7658-4653-b8a7-9761bf3da36e`, READY_FOR_REVIEW) is outside approval. Its original case, two items and two active allocations remain untouched. Its case checksum after archiving is `d40e0c9977a7f45e9b07c7663c9cc411`.

## Method and integrity

Migration `20261010142708_archive_explicit_prelaunch_loan_qa.sql` adds the server-administrator-only `private.loan_prelaunch_qa_archive` table. Existing canonical `loan_can_view_case`, `loan_can_manage_case` and `loan_can_accept_case` retain their role/ownership conditions and add a deny condition for explicitly archived cases. Existing RLS policy definitions and function execute grants are unchanged. The private marker table has RLS enabled, no client policies and no grants to PUBLIC, anon, authenticated or service_role. There is no frontend purge API.

The approved operation is `scripts/sql/archive-approved-prelaunch-loans-20261010.sql`. It checks exact UUID/U-number pairs and terminal status, locks only their case/allocation rows, rejects unreleased allocations and existing markers, and inserts exactly seven markers in one repeatable-read transaction. Any failed assertion rolls back that transaction. Never select cases using "QA" in free text.

It fingerprints every public source table plus storage.objects before/after and asserts equality. Result: **179 source tables unchanged**; source fingerprint `ff05905f68659195bfe036c9aad50683`. Only seven private archive markers were inserted. All loan IDs, status rows, immutable snapshots and audit evidence remain intact. No source row was deleted or rewritten.

Read-only reference audit found zero exact case UUID/U-number matches in 29 candidate external audit/event/reservation/configuration/CRM/Budget tables and no external foreign-key relationship into these Loans cases. This does not prove that externally downloaded documents never existed; IDs therefore remain reserved.

| Retained approved-case data | Count |
| --- | ---: |
| Case items / physical relations | 12 |
| Released loan allocations | 12 |
| Active approved-case allocations | 0 |
| Case versions | 1 |
| Return inspection headers / inspected items | 2 / 2 |
| Acceptance records | 0 |
| Private photo references and existing storage objects | 17 / 17 |
| Audit events | 110 |
| Deviations | 0 |

No new reservation release was necessary: all 12 approved-case allocations were already released. QA planning-unit reservations: 0. Other allocations, including U-6608's two active reservations, were retained.

All physical stock, serials, Brik values/shared groups, planning supply units, Product Master, CRM/leads, quotes/orders/configurations, Budget, partner/contact/user data were protected by source fingerprints. In particular `411666-00` / `411666-00-2063` / Brik `159` / Fabric asset `8d5aae7a-4010-4ac4-b436-bae629894b5b` remains unchanged in warehouse 2. The two synthetic planning supply units were also preserved because physical/supply data is explicitly outside cleanup scope.

Post-checks: all seven stored case checksums still match; no orphan case items, allocations, photo references or QA storage objects; no missing QA media; Loans foreign keys are validated. Existing public/storage RLS policy fingerprint remains `2cd7e0192b7741d713ff6f686eba25dc`. No new security warning was introduced. The new private table has the expected deny-all RLS informational notice ([Supabase explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)); no client access should be granted to remove this notice.

## U-number decision

**Reset: NO. Next loan: U-6609**, when verified last_value=6608 and is_called=true (subject to later normal loan creation).

U-6601–U-6607 are still referenced by preserved immutable audit and original business rows under the unique U-number model; U-6608 is an unapproved current case. Resetting to 6601 would collide with retained identifiers. No allocator/sequence was reset or advanced by QA. Never test production creation inside a rollback merely to inspect its number: PostgreSQL sequence increments do not roll back.

The requested first real number U-6601 remains blocked. It requires a separately approved, complete strategy for retained identities/external references; this archive intentionally does not provide number reuse.

## Verification and repeatability

- Actual published Portal `https://timan-site.lovable.app/portal/loans`: Aktive, Afsluttede and Alle show **0 approved QA cases**, while U-6608 remains visible in Aktive/Alle.
- Actual authenticated Backend read: overview/lifecycle/return-state RPCs expose only U-6608; archived direct events/photos/private storage and history RPCs expose 0 rows.
- Existing historical source rows remain available only to database administrators; ordinary Portal detail/history access is denied.
- Desktop and 390 px lists/filters and new-loan form verified. Live creation is deliberately not submitted, so no additional case or U-number is consumed.
- Isolated canonical new-loan RPC succeeds with U-6609; isolated rollback confirms no business rows remain.
- 193 focused Loans UI/service regression tests pass.
- 94 isolated PostgreSQL integrity/security assertions pass, exercising the exact guarded operation against local fixture identities, all five Portal roles, private media, canonical creation, immutable history and administrator rollback.
- Node syntax check, scoped ESLint and production build pass.
- Full app TypeScript check was attempted and reports pre-existing errors in unchanged source/tests (Academy, Configurator, CRM, etc.). No TypeScript files, dependencies or TS configuration changed in this task.

Run from repository root with its existing dependencies:

```powershell
# Existing isolated Loans PGlite runtime; set this only if it is not in this checkout.
$env:LOANS_PGLITE_MODULE = 'ABSOLUTE_PATH_TO_EXISTING_PGLITE/dist/index.js'
node scripts/test-loan-qa-archive.mjs
npm test -- src/test/loan-module-foundation.test.ts src/test/loan-form-completion.test.ts src/test/loan-operational-improvements.test.ts src/test/loan-lifecycle.test.tsx src/test/loan-return-workflow.test.tsx src/test/fabric-loan-stock.test.tsx src/test/loan-overview-info.test.tsx src/test/loan-overview-info-service.test.ts src/test/loan-form-interaction.test.tsx src/test/loan-header-navigation.test.tsx
node --check scripts/test-loan-qa-archive.mjs
npx --no-install eslint --no-config-lookup --rule 'no-unused-vars:error' --rule 'no-unreachable:error' --rule 'no-undef:error' --global process --global console scripts/test-loan-qa-archive.mjs
npm run build
git diff --check
```

The one-time live SQL must **not** be replayed after success: existing markers cause a guarded failure. Future approved cleanup must start with a fresh exact-identity/reference/reservation audit, never extend this whitelist implicitly.

## Administrator rollback

Do not delete the archive table or revert role checks. For the exact approved identities in the table above, a database administrator can restore Portal access by removing ONLY their private archive markers in a reviewed transaction, after verifying each stored original checksum still matches its original case row. Preserve an operation record before removal. This restores the untouched original source/history/media without importing a backup; it does not reset the allocator. The isolated PostgreSQL test exercises this rollback. No live rollback was performed.
