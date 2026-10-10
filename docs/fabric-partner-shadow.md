# Partner master shadow, no cutover

## Boundaries

Fabric `Staging.C5.CUSTTABLE`, DAT only, supplies an explicit 22-field view.
The dedicated signed ingest publishes only `fabric_partner_master_shadow`.
It never writes `dealer_accounts`, partner relations, users, contracts, CRM,
Academy, Loans, geocoding, discounts or historical snapshots. SharePoint remains
the production source. C5-only customers are not new Portal partners.

Shadow identity is `(company, source_row_number)`. Account numbers remain strings;
duplicates are comparison conflicts, not arbitrarily deduplicated accounts.
Absent rows remain as source provenance with `source_present=false`.
SQL rejects empty, stale, malformed, duplicate-row and unexpectedly shrinking
snapshots (more than 10% reduction). Each accepted snapshot is immutable and
idempotent by ID plus payload fingerprint. Concurrent publication is locked.
Failed refreshes preserve the entire last successful snapshot and timestamp.

The backend read RPC uses existing `is_backend()` and returns explicit business
fields only. All shadow tables have RLS; anon/authenticated have no direct table
access. `service_role` can execute only the dedicated ingest/failure functions,
not directly mutate the shadow tables through their grants. No existing policy
or grant is changed. The UI has no apply/update control.

## Normalization and ownership

The shared `fabricPartnerSnapshot.ts` validator owns wire normalization.
It trims padding, recognizes the standalone C5 0x02 empty marker, preserves
leading zeroes and raw account provenance, rejects embedded control characters
and unapproved fields. C5 `LASTCHANGED` is datetime2 without a timezone; it is
stored as timestamp without time zone, never silently converted to UTC.
Language, blocked and approved values retain their native integer codes.

Only DK + four digits + whitespace + a nonnumeric city is deterministically
parsed from ZIPCITY. Other nonempty formats remain raw and REVIEW_REQUIRED;
null parsed values are not proposed as replacements for Portal addresses.

Approved proposed types: 1/A dealer, 2/B service_partner, 3/C importer,
5/E dealer_customer. All other codes, including 0, require review. Portal type
uses existing `resolvePartnerAccountType`, including label precedence. No type,
seller or contact is automatically changed. Field diffs are whitespace-trimmed
exact comparisons, not fuzzy equivalence. Country spelling differences remain
visible. Parsed-field differences with unsupported ZIPCITY require review.

`c5_invoice_account_number` is source accounting data only. Comparison to the
Portal billing account is informational; it does not propose overwriting
`billing_account_id`, parent accounts or network/access hierarchy.

## SharePoint field parity

Current source: SalgMarketingTiman / Debitor-Filtered (DebitorFiltered).
This is an upstream filtered list, not all DAT C5 customers. Current mapper and
the production sync/update whitelist are unchanged.

| Current synchronized field | C5 counterpart | Coverage |
| --- | --- | --- |
| company_name (Title) | NAME | Full source candidate |
| account_number (Account) | ACCOUNT | Full string identity; no UUID replacement |
| address_line_1 / address_line_2 | ADDRESS1 / ADDRESS2 | Full source candidate |
| zip_city_raw | ZIPCITY | Full raw source candidate |
| postal_code / city | parsed ZIPCITY | Partial; only proven parsing is proposed |
| country | COUNTRY, ISO_LAND | Source candidate; spelling/code differences reviewed |
| source_customer_type_code | A_B_KUNDE | Raw code retained; not a Portal type write |
| dealer_type / customer_type / customer_type_label | proposed approved type mapping | Partial; legacy/manual types and unknown codes reviewed |
| external_id (SharePoint item ID) | None | Technical SharePoint metadata; preserved |
| source_created_at (Oprettet) | None | Technical SharePoint metadata; preserved |
| source_modified_at (Modified) | LASTCHANGED | Not equivalent; C5 timezone unknown; preserve both |
| source = sharepoint | Fabric shadow provenance | Production source unchanged |
| last_synced_at | shadow synced_at | Separate synchronization timestamps |
| initial is_active on new SharePoint accounts | None | Portal-owned; no shadow creation |

There is no synchronized business field proven exclusively available in
SharePoint except its source metadata. Existing SharePoint parsing/type
semantics cannot be assumed interchangeable with proposed C5 semantics.
Phone, email, salesrep, INVOICEACCOUNT, payment, currency, VAT, GROUP_, BLOCKED
and APPROVED are not written by the current SharePoint masterdata update path;
their new shadow presence does not grant permission to update Portal values.

## Live audit, 2026-10-09

- DAT C5: 916 rows, 916 distinct trimmed accounts.
- Existing Portal: 111 accounts, including inactive/archive scope.
- Known C5 type counts: 1=67, 2=14, 3=11, 5=153. Other codes=671.
- 12041 JE Service: row 320721720, type 5, seller EM, invoice 12040.
- 12040 JE SERVICE: row 320720228, type 5, seller EM, invoice 10295.
- 10295 AB Lauridsen: C5 row 293216581, type 1, seller EM.
- Portal 10295 UUID: bc6ae72c-b653-4995-a446-dfdd540b01d1; seller EM.
- Portal relation 10295 -> 10285 remains dealer_has_service_partner.

Read-only production SharePoint verification checked all 92 mapped source
accounts: 82 matches, 10 differing accounts, 0 missing in Portal, 19 Portal-only
relative to that list. Searching all comparison rows for 12041, 12040 and
JE Service returned no match. Neither JE account is supplied by the currently
active filtered SharePoint source. The underlying upstream exclusion criterion
has not been inspected; it must not be guessed.

12041/12040 were not found in dealer_accounts (including inactive/deleted/raw),
aliases, legacy dealer mappings, app-user dealer/company fields, CRM leads,
activities, configurations, warranty imports/submissions, relation history,
agreement history or Portal submissions. No account was created. C5 type 5
proves why JE is known as a Forhandlerkunde. The exact upstream list/filter
reason for its absence is not yet proven and must not be invented.

## Production activation

1. Review/apply only `20261009100017_fabric_partner_master_shadow.sql` to
   rdodyoixxybiozvmuqon. This creates isolated shadow objects, not a cutover.
2. Create `C5.partner_master_current` from `fabric/partners/partner_master_current.sql`
   only if absent; compare its definition if already present.
3. Deploy only `fabric-partner-shadow-sync`. JWT gateway verification is disabled
   because this machine-only endpoint verifies HMAC, clock window and exact body.
   Browser Origin/Authorization requests are rejected. Keys never cross the wire.
4. Provision a dedicated encrypted Fabric HTTPS connection and the corresponding
   backend `FABRIC_PARTNER_SHADOW_INGEST_SECRET`. Never copy secrets to code,
   notebooks, browser environment, terminal logs or reports. Do not implicitly
   reuse/expand the Loans identity or its dedicated ingest credential.
5. Deploy the scoped notebook with the non-secret connection ID parameter,
   using an identity restricted to the approved partner view. Schedule every
   10 minutes independently of C5/Loans production pipelines. First run verifies
   expected row count, JE chain, AB provenance and snapshot freshness.
6. Verify Backend comparison desktop/390px against live snapshot, collect parity
   counts and verify unchanged Portal/relations hashes before committing/pushing.

No masterdata cutover pilot is ready before the live snapshot, full parity
counts, upstream JE absence and review-only conflicts have been accepted.

### Conditional deployment safety review, 2026-10-09

The migration is already applied in rdodyoixxybiozvmuqon, recorded as version
20261009134832 with name 20261009100017_fabric_partner_master_shadow. Do not
reapply it. The shadow state still has row_count=0 and no successful snapshot.
The deployed shadow function definitions match the local migration; there are
no application triggers on the three shadow tables. The Edge ingest is not
deployed. No deployment, credential creation, live ingest or commit/push was
performed during this review.

Production request metadata shows an app_users PATCH at 13:51:17.024 UTC for
NB (50877e58-054d-4fc9-ad02-6ca0a6037d12), between successful calls to the
existing admin-user-actions function. A later PATCH at 16:12:17.625 UTC
correlates with the row's current updated_at=16:12:17.615 UTC. Only this user
has a current updated_at on this date. These are observed writes, not merely
unstable aggregate ordering.

The deployed admin-user-actions version 20 predates the shadow task. Its
sync_self handler updates updated_at on the caller's own existing row, also
setting auth_user_id only if missing. LoginStep invokes this existing handler
after login. The link_self handler writes only when auth_user_id is missing.
The observed request timing is consistent with the existing login path, not
the undeployed shadow endpoint. Request bodies and historical before/after
user rows are not available in the inspected audit/logs, so the exact action
and complete historical column diff cannot be asserted as proven.

The local SQL/RLS regression now installs a statement-level write-rejection
trigger on a synthetic app_users fixture, including no-op updates. Migration,
ingest, replay, rejected snapshots, failure recording and Backend preview all
pass with this guard enabled; the full user-row checksum is unchanged. This
proves zero app_users writes from the tested shadow paths without masking
updated_at. It does not replace missing historical production evidence.

At that review, conditional deployment was held pending the historical checksum
control evidence. The subsequent approved structural/controlled proof below
supersedes that historical-evidence gate. No legitimate production change was reverted. A dedicated
Partnerdata credential and controlled live snapshot remain pending; Loans,
n8n and user credentials have not been reused.

Current checks: 43/43 focused Vitest tests; 29 SQL/RLS checks; scoped ESLint,
build and git diff --check pass. Full application typecheck fails outside the
shadow scope; unrelated diagnostics are not modified here.

Local checks: focused Vitest, `node scripts/test-fabric-partner-shadow.mjs`,
typecheck compared with HEAD baseline, scoped ESLint, build, `git diff --check`.

### Continuation: read-only parity and dedicated credential blocker

The existing worktree was fast-forwarded without discarding its shadow work to
origin/main 055ff020c9a652339b05ff5b05a37a480bbd471e. No scoped commit/push has
been made. No new migration or production business write was performed.

The authenticated Supabase Custom Secrets search returned no entry for
`FABRIC_PARTNER_SHADOW_INGEST_SECRET`. Its Name field is prepared; the user must
create and submit a fresh, dedicated value through the secure UI and subsequently
store that same value in a dedicated Fabric secure connection. No secret value
was read, generated, entered or logged by the agent. Loans/n8n/user credentials
are not reused. Edge deployment and live ingest remain pending.

A read-only SELECT of exactly the 22 approved fields from the existing
`C5.partner_master_current` view returned all 916 DAT rows. The result was
compared locally with all 111 existing Portal partners using the canonical
normalizer and parity resolver. This is an offline comparison of live reads,
NOT a successful Fabric-to-Supabase ingest or a published shadow snapshot.

| Metric | Read-only comparison |
| --- | ---: |
| C5 DAT rows | 916 |
| Portal partners | 111 |
| Matched existing accounts | 111 |
| Exact compared-field match | 24 |
| Accounts with field differences | 87 |
| C5-only | 805 |
| Portal-only | 0 |
| Type conflicts | 6 |
| Seller conflicts | 5 |
| Unknown C5 type codes | 671 |
| C5 Forhandlerkunder | 153 |
| Matched existing Portal Forhandlerkunder | 12 |
| AUTO_SAFE_CANDIDATE, all accounts | 3 |
| REVIEW_REQUIRED, all accounts | 894 |
| MATCH classification, all accounts | 19 |
| AUTO_SAFE_CANDIDATE, C5 Forhandlerkunder | 0 |
| REVIEW_REQUIRED, C5 Forhandlerkunder | 153 |
| Forhandlerkunde relation conflicts | 1 |

Status counts and safety classifications are separate: compared fields can
match while raw C5 blocked/approved codes still require review. A read-only
candidate classification does not authorize a write or partner creation.

JE 12041 has type 5, seller EM and source row 320721720. Its exact invoice
chain is 12041 -> 12040 -> 10295. The terminal C5 dealer matches the existing
Portal dealer 10295. Proposed dealer 10295 remains a review-only suggestion;
JE has no existing Portal partner/relation and is REVIEW_REQUIRED.

AB 10295 has no differences in the compared master fields. Its Portal UUID
bc6ae72c-b653-4995-a446-dfdd540b01d1, seller EM and active
dealer_has_service_partner relation to 10285 remain unchanged.

Kendy 50538 has invoice chain 50538 -> 11841, matching its existing Portal
parent_account_number 11841. It remains REVIEW_REQUIRED: the non-DK ZIPCITY
is not safely parsed and the invoice/billing comparison differs. Palles Auto
12019 has chain 12019 -> 10210 matching existing Portal parent 10210; its
invoice/billing difference is review-only, so it also remains REVIEW_REQUIRED.
Neither accounting chain is used to change hierarchy or billing.

The read-only comparison UI now includes Forhandlerkunder and
AUTO_SAFE_CANDIDATE filters, separate safety classification/reason, exact
invoice-chain evidence and Portal parent parity from the already-loaded
Backend dataset. Invoice-account comparison cannot propose a billing write.
No apply/update button exists. Production browser verification remains pending
the live snapshot and deployment; component tests are not reported as live QA.

Sorted full-row checksums for app_users, dealer_accounts,
partner_account_relations, loan_cases and configurations are identical before
and after this continuation. Historical PATCH attribution remains limited as
documented above; no historical before/after row images were recovered.

Latest local checks: 50/50 focused tests, 29 SQL/RLS checks with app_users
write-rejection guard, scoped ESLint and build pass. Full app typecheck reports
111 diagnostics, zero in the scoped shadow files; do not report global
typecheck as PASS or change unrelated errors in this task.
An in-memory compiler-host comparison against the unmodified tracked HEAD
also reports 111 diagnostics and zero added diagnostics. Tracked and untracked
scoped files pass `git diff --check`; Git reports only CRLF conversion warnings.

### Structural and controlled production safety proof, 2026-10-09

The user approved structural plus controlled before/after verification instead
of attempting to recover unavailable historical field values. The historical
PATCH attribution remains qualified; it is no longer a deployment prerequisite.

Actual production `pg_get_functiondef` was reviewed for all three shadow RPCs.
Their function-body checksums exactly match the unchanged local migration:

| Function | Body MD5 |
| --- | --- |
| fabric_partner_shadow_ingest | 43ecb2bb001596d457a27e6f3249bce9 |
| fabric_partner_shadow_record_failure | 747267396bef0749e75873deacb72bd7 |
| fabric_partner_shadow_preview | a5353918ba50bd79d7f8eada5d5aa7f2 |

The reachable write set is exactly the three dedicated shadow tables. Ingest
and failure recording call no custom/shared write function. Preview calls
`is_backend`; the actual production definition only SELECTs app_users through
read-only auth.uid/auth.jwt helpers that read request settings. It then reads
dealer_accounts and shadow data without DML. These reads are not write paths.

The Edge module calls only ingest and failure-recording RPCs; its imported
bounded-body, HMAC and normalization helpers perform no database writes.
The imported Loans module is transport code reuse, not Loans credential reuse,
and does not invoke its unrelated sync functions. No app_users, dealer_accounts
or partner_account_relations INSERT/UPDATE/DELETE/TRUNCATE target is reachable.

Production catalog checks show zero triggers (including internal), zero inbound
or outbound foreign keys, zero rewrite rules and zero RLS policies on the shadow
tables. All three are ordinary non-inherited tables. Defaults and CHECKs use
only constants, now(), length/btrim and native comparisons. Thus there is no
indirect DML-trigger, rule, FK-cascade or partition chain to business tables.
All enabled database DDL event-trigger definitions were also inspected: the
relevant effects are shadow-table RLS enablement and PostgREST schema reload
notifications. Extension-specific grant handlers are gated on extension DDL;
this migration creates no extension and does not write app_users/partners.

`scripts/verify-fabric-partner-shadow-isolation.sql` was first verified locally
with statement-level write-rejection guards on synthetic app_users,
dealer_accounts and partner_account_relations. It was then executed against the
already-applied canonical production RPC at 2026-10-09T19:12:28.881545Z:

- One isolated synthetic shadow row and its snapshot run were actually written.
- All 8 app_users rows were identical before/after, including updated_at and
  full-row and per-column checksum comparisons; changed row IDs/columns: none.
- dealer_accounts and partner_account_relations checksums remained identical.
- A deliberate subtransaction exception rolled back all test shadow writes.
- Subsequent independent reads confirmed zero shadow rows/runs and the original
  empty state, with no successful live snapshot claimed and no QA residue.
- No production trigger, policy, function, credential or permission was changed.

Structural zero-write-path: PASS. Controlled production before/after: PASS.
The app_users safety gate is closed. Dedicated credential entry remains a
user handoff; deployment/live ingest remain pending that secure setup, not the
unavailable historical before/after values. No commit/push or cutover occurred.

Current focused tests: 50/50 PASS. Local SQL/RLS checks: 35 PASS, now including
the same controlled isolation SQL and write rejection on all three protected
tables. Scoped lint passes. Application source is unchanged by this safety step;
the prior full typecheck baseline remains 111 unrelated errors, zero introduced.

### First accepted live snapshot, 2026-10-10

The user saved the existing dedicated v2 connection with the same backend
credential. No new credential, connection or permission was created. The
notebook uses its bound, non-secret connection ID, not the external connection
ID. Authentication now passes: a signed empty payload reached the schema guard
and was rejected with HTTP 400/SYNC_FAILED rather than HTTP 401. The subsequent
real snapshot succeeded. No HMAC algorithm, validation or threshold was weakened.

- Notebook: d64cc8b8-8448-419e-b294-af801ea55e48 in Timan Fabric.
- Source: exactly the approved 22 fields from Staging.C5.partner_master_current.
- Snapshot: 6d0b9a78-8ece-4dca-97bf-00275ae200ab.
- Accepted at 2026-10-10T09:52:32.045198Z; source_as_of 09:52:30.763203Z.
- Actual published rows: 916; distinct accounts: 916; Portal partners: 111.
- Last error cleared; last successful snapshot remains intact.

The canonical comparePartnerMaster/partnerParityCounts helpers were run against
the actual guarded preview RPC response and existing Portal parent metadata.
Live counts reproduce the read-only comparison above: matched 111, exact-field
matches 24, field differences 87, C5-only 805, Portal-only 0, type conflicts 6,
seller conflicts 5, unknown type codes 671, AUTO_SAFE_CANDIDATE 3 and
REVIEW_REQUIRED 894. Forhandlerkunder: 153, matched 12, C5-only 141, auto-safe 0,
review-required 153, relation conflicts 1. These are review results, not writes.

JE Service 12041 remains C5-only, with source invoice chain
12041 -> 12040 -> 10295; no Portal partner or parent relation was created.
AB Lauridsen 10295 retains UUID bc6ae72c-b653-4995-a446-dfdd540b01d1,
seller EM and its active relation to 10285. Kendy 50538 retains seller AKR and
parent 11841; Palles Auto 12019 retains seller EM and parent 10210. Both remain
review-required because source facts are not automatic billing/hierarchy writes.

Protected before/after checksums prove unchanged dealer_accounts, partner
relations, CRM leads/activities, configurations/items, Budget and Brik metadata.
The full observation window is NOT globally unchanged: an independent REST
PATCH updated the NB app_users row at 09:51:14.531Z, before this ingest. A
separate Loan workflow created a case at 09:53:25 and added assets/photos before
READY_FOR_REVIEW at 09:57:08; its normal Loans RPCs are visible in request logs.
Scheduled Loans inventory synchronization also changed its projection. These
concurrent actions were not reverted. The structural zero-write-path and prior
controlled isolation proof remain PASS; shadow ingest has no path to those
tables. Exact private before/after field values for the NB PATCH were not
retained, so its complete column diff is not claimed as proven.

SharePoint integration and its production source remain unchanged; no cutover
or SharePoint write was performed. The existing served preview did not yet
contain the new comparison button at the initial browser check. Production UI
acceptance must not be inferred from component tests or triggered Lovable builds.

### Final browser and engineering verification, 2026-10-10

After scoped commit ed707811 was pushed, the existing preview loaded the new
comparison UI on normal browser reload. No Lovable Build, Preview generation,
publish action or new hosting was invoked. Live Backend UI displays Portal 111,
C5 916, matched 111 and the exact status/classification counts above. Search and
the Forhandlerkunder filter work together. JE, AB Lauridsen, Kendy and Palles Auto
were expanded and their source provenance, invoice chains and existing Portal
parent parity verified in the browser. The panel has no apply/create/update
business controls.

Desktop and an actual 390 x 844 viewport passed. At 390 px the document width
is 375 px and the comparison panel client/scroll widths are both 350 px, with
wrapped filters, readable status labels and vertically reachable details.
Temporary viewport overrides were reset after verification.

Final checks: 50/50 focused tests, 35 local SQL/RLS/isolation checks, scoped
ESLint, Vite production build and staged git diff --check PASS. Full application
typecheck is NOT globally green: 111 diagnostics. An in-memory comparison to
the unmodified main base 5238375080e14ff61c375339dcfc587e5c1ac6f3 also finds
111 diagnostics and zero added diagnostics. No unrelated type failures were
fixed. Production checks confirm all three shadow tables retain RLS and no
anon/authenticated direct SELECT/DML access. The security advisor's no-policy
information on these intentionally RPC-only tables does not warrant broad
client policies; existing unrelated advisories were left untouched.

Shadow/parity technical acceptance is complete. Masterdata cutover remains
unapproved and not ready: unknown type codes, review-required accounts and
review-only invoice/billing/hierarchy differences need separate business
decisions. SharePoint remains the production masterdata source.
