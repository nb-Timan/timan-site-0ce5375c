# Fabric Partnerdata review / import preparation

This extends the existing shadow/parity comparison, not the production
masterdata source. SharePoint remains authoritative for existing Portal data.
No import, apply, cutover, account creation or relation update is implemented.

The statements above describe the original review-only phase. The explicitly
approved JE Service one-account pilot and permanent cooperation lifecycle are
documented below; they do not authorize a general masterdata cutover.

## Persistence and concurrency

`fabric_partner_review_decisions` contains immutable account decision versions.
Reviewer references canonical `app_users.id`, not the Auth UUID. Each version
records time, comment, source snapshot, source/Portal fingerprints, explicitly
chosen future type/parent, and an idempotency request identifier.
`fabric_partner_review_fields` stores the six independent field choices as
relational child rows, including trusted current/source/approved values.

Saving checks the expected decision version and displayed source/Portal hashes.
The existing shadow-ingest advisory lock prevents a refresh midway through a
decision. Identical requests return the existing decision; altered replays fail.
UPDATE/DELETE/TRUNCATE on decision history are rejected even for privileged
callers. New decisions supersede old decisions without deleting the audit.

Source fingerprints include current source facts and invoice-chain ancestors,
but exclude sync timestamps and source LASTCHANGED metadata. Portal hashes
include existing facts/relations and an explicitly selected parent. Changed or
missing source facts require recheck without deactivating or overwriting an
approval. Conflicted approvals do not enter the import queue. Context hashes used for editor
concurrency are parent-free; saved/current review hashes include parent facts.

## Business boundaries

Known types remain 1/A dealer, 2/B service partner, 3/C importer, 5/E dealer
customer. Unknown codes require an explicit manual type and documented reason.
Backend can document a type exception as a review decision, never an automatic conversion.
Dealer customers require an explicit existing eligible Portal dealer; invoice
chains are evidence, never automatic parent/billing writes.

Only company name, address lines, postal code, city and country can be chosen
for later import. UUID, seller, phone/email, billing, user access, relations and
Portal-owned operational metadata are not writable through this review RPC.
Unparsed C5 ZIPCITY cannot be approved as postal code/city. Existing accounts
enter the changes queue only when an explicitly approved field actually differs.

## Permanent Portal overrides

The additive migration `20261010110700_permanent_partner_review_overrides.sql`
preserves all historical rows and existing access controls. An active approval
has priority over existing Portal values, which have priority over a raw C5
proposal. Explicit approved null/blank values remain null/blank.

The editor defaults to keeping the approved value, not rereading C5 on save.
Backend can explicitly choose current Portal, current C5 or a bounded manual
Portal correction for each of the same six fields. Every version separately
captures the approved value, the contemporaneous C5 value and Portal value.
Earlier original C5 evidence remains available in immutable history.

Source changes update only shadow facts and recheck status. A clarification
event retains the active approval. An explicit Backend PENDING or IGNORED
event revokes it; the editor warns before saving that decision. A later
APPROVED event replaces the active approval but never deletes prior evidence.
The server rejects missing approved values, unsafe correction payloads,
concurrent versions/source changes and unauthorized callers.

For JE Service, the approved `dealer_customer` type and explicit AB Lauridsen
UUID are Portal-owned decisions. The 12041 -> 12040 -> 10295 invoice chain is
separate C5 evidence, not a Portal parent relationship. This implementation
does not create JE Service or change any operational partner relationship.

New decisions additionally capture the original C5 type and invoice account
in separate columns and the original invoice chain as ordered relational child
rows. Migration `20261010112321_partner_review_source_evidence.sql` does not
backfill historical guesses. The Backend preview/history keeps these facts
separate from the approved Portal parent and current raw C5 facts.

Permanent-override verification: 112 focused tests and 75 review SQL/RLS checks
plus 35 shadow regression checks PASS. Scoped lint/build/diff checks PASS.
Typecheck remains at 111 existing diagnostics, with zero new diagnostics
against 270d16bf. The additive migration is applied to the canonical project.
A rollback-only production transaction verified JE Service type/relation and
frozen values through changed source facts and explicit keep-approved save.
All 18 baseline checksums were identical after the first rollback verification.
At final verification only the independently scheduled Fabric Loans projection
had refreshed; Portal business data, users, relations and loan records remained
identical. Six historical review events remain, JE remains version 4 PENDING,
and no partner was created. Original source evidence was also verified in a
rollback-only production transaction; no QA approval or source mutation remains.

## Security

Both new tables have RLS, no direct client policies and no direct grants to
anon/authenticated/service_role. Authenticated RPC access is intentional and
checks the existing active, approved Timan Backend gate. Helper functions are
not client executable. The save RPC inserts only the two review tables; its
triggers cannot write business tables. Advisor notices about absent policies
and intentional Backend-gated SECURITY DEFINER RPCs do not justify broad grants.

## Verification on 2026-10-10

- Migration file: 20261010103109_fabric_partner_review_decisions.sql.
- Canonical project: rdodyoixxybiozvmuqon; MCP-applied history version:
  20261010104729, name fabric_partner_review_decisions.
- 101 focused tests, 39 review SQL/RLS/persistence checks and 35 existing
  shadow SQL/RLS/isolation checks PASS; scoped lint, build and diff check PASS.
- Full typecheck has 111 pre-existing diagnostics. In-memory comparison to
  unmodified 603a0fcf finds the same 111 and zero new diagnostics.
- Existing served preview verified without Lovable Build/Preview generation.
- JE Service 12041: explicit 12041 -> 12040 -> 10295 evidence and parent choice,
  approval/reload, ignore, clarification and final pending status verified.
- Live unchanged shadow refresh accepted 916 rows at 10:53:41.612123Z; the
  earlier approval survived with unchanged business fingerprints.
- TBS 10374: mixed C5 address/city and KEEP_PORTAL remaining field decisions
  verified after full reload and in the existing-changes import queue.
- QA ended with JE version 4 and TBS version 2 PENDING, no active approval;
  all six immutable decision versions and their field rows remain in history.
- Changed own source/invoice-chain facts, stale versions, unknown type, unsafe
  address choices, replay conflicts and unauthorized roles tested locally;
  production source facts were not artificially edited for testing.
- Actual 390 x 844 viewport: dialog client/scroll width 333 px, document width
  375 px; normal internal scroll reaches Save/history. Overview panel client
  and scroll width both 350 px. Desktop PASS.
- Protected-table checksums stayed unchanged for dealers, users, relations,
  CRM/configurations, Budget, Loans business records and Brik metadata. The
  independently scheduled Fabric Loans projection refreshed during the window;
  this task has no write path to that projection and did not change its sync.
- SharePoint code/integration/source was not modified or invoked for writes.

The review phase is technically complete. An actual controlled import pilot
still requires separate approval, an explicit pilot scope and rollback design.

## Permanent cooperation lifecycle

Migration `20261010113512_permanent_partner_cooperation_lifecycle.sql` is
additive and performs no backfill, partner import or relationship activation.
It was separately approved and applied to the canonical production project;
MCP history version 20261010115715, name permanent_partner_cooperation_lifecycle.

Approved operational dealer/customer cooperation uses the existing
`partner_account_relations` UUIDs, not C5 invoice-account chains. Backend alone
can explicitly activate, switch or end cooperation through a version-checked,
idempotent RPC. A new dealer requires explicit confirmation and a reason.
Ending preserves the inactive row with date, actor and reason; immutable child
events preserve every period, prior dealer, original source snapshot/invoice
evidence and optional review decision. Historical CRM/order links never move.

The same transaction updates the existing customer `parent_account_number`
access pointer. This is necessary because existing organization/CRM scope
consumers still use it. Ending clears that pointer, and switching replaces it
only after checking for ambiguous/conflicting legacy ownership. Existing
independent permissions are not broadened or removed. Other relation types
retain their existing behavior.

Table triggers reject protected relationship deletion, direct activation,
direct deactivation and automatic parent reassignment, including source-sync
writes. Only a Backend-gated same-transaction audit event authorizes the
specific changes. Audit data has RLS and no direct client/service grants.

C5 refresh changes shadow facts only. It cannot end or move cooperation;
changed source fingerprints require recheck. Review comparison uses the latest
operational cooperation decision (including an ended/null parent) instead of
reviving a prior proposed relation. Existing approved profile-field overrides
remain separate and unchanged. JE Service is not imported by this feature.

Local verification includes real migration execution, canonical organization
scope/RLS denial after switching, source-refresh persistence, explicit end/
reactivation, retry/version protection, append-only history, and unchanged
UUIDs, sellers, users and historical order snapshots. No real production
relationship is used as a mutation fixture.

Verification: 139 focused UI/domain/access tests, 46 cooperation SQL/RLS
checks, 75 existing review SQL checks and 35 shadow isolation checks PASS.
Scoped lint and build PASS. In-memory typecheck comparison against cc2a78b8
has the same 111 pre-existing diagnostics and zero new diagnostics.
Production verified RLS, fixed search paths, private helpers, no direct audit
grants, and denial of history/change/direct-audit access for non-Backend.
The new audit remains empty: no customer import or relationship change was
created. Existing relation fingerprints exclude only the three newly added
nullable end-summary columns when comparing with the pre-migration baseline.
No SharePoint integration or source was modified.

## JE Service one-account pilot

`20261010120531_je_service_controlled_import_pilot.sql` was explicitly approved
and applied to `rdodyoixxybiozvmuqon` (MCP migration history version
`20261010121815`, name `je_service_controlled_import_pilot`). Its only import
scope is DAT account 12041 under existing
dealer 10295. The existing approval, six C5-selected fields, current source/
parent fingerprints, absence of account/alias/name conflicts, active parent
and separately captured 12041 -> 12040 -> 10295 invoice evidence are required.
The preview is read-only; deploying the migration itself imports nothing.

After separate explicit production approval, one atomic Backend RPC created
one new canonical dealer-customer UUID, one permanent cooperation via
`partner_cooperation_change`, one cooperation event and one immutable import
receipt. The receipt links the pre-creation approval/fingerprints/source
snapshot to the post-creation canonical cooperation event. Existing rows,
seller assignments, users and historical business documents are not updated.
The legacy address compatibility field mirrors the approved address line;
billing UUID and new customer seller assignments stay null. Seller display
continues to inherit from the existing parent. Invoice account 12040 remains
source evidence and is not created as a Portal account.

No generic/bulk importer, automatic login, SharePoint cutover or frontend
apply button is introduced. The pilot RPC accepts no account selector or
caller-provided profile payload. Source/approval changes fail closed, retries
return the original result, and cooperation/audit failure rolls back the
entire new account. Later retries never reactivate an ended cooperation.
Approval was obtained before both production installation and execution.

Production result on 2026-10-10 at 12:19:20 UTC:

- JE account UUID: `aa88f1a3-a7bd-4e85-bc86-9e80175ac7ba`.
- Original approval version 7: `032e3450-873e-4669-bd00-0b06db506349`.
- Permanent relation: `395f3ef9-7012-4b0d-9885-227b4b118ebc`.
- Cooperation event: `b51de410-d027-432a-a6eb-a677256ff9e0`.
- Immutable import receipt: `6dbd5603-86a8-4e0f-97fa-ff9cb3369b55`.
- 112 Portal accounts, 8 unchanged users, no Portal account 12040 or new login.

Exact production retry returned the same identifiers with `replayed=true`;
no duplicate account, relation or audit event was created. Existing account,
user, relation, CRM, Budget, Loan and media checksums matched immediately
after import. The independently scheduled Loans snapshot at 12:20:30 UTC
subsequently changed its derived inventory checksum; that pipeline was not
invoked or modified by the pilot. The other 17 checksums remained identical.
No SharePoint code, configuration or source was changed.

The existing Fabric notebook ran successfully again at 12:26:38 UTC with
916 rows (snapshot `a607de27-ce62-40ff-a605-955b806c83cc`). JE's UUID and active
relation to 10295 survived unchanged. Backend browser verification confirmed
JE under AB Lauridsen's collaborators, the preserved 10285 Servicepartner,
the inherited EM seller, exact approved profile values and reload persistence.
Desktop and actual 390 px passed with no horizontal overflow.

Remaining closure limitation: the existing review resolver reports
`approval_active=true` and `needs_recheck=true` after materialization. The C5
fingerprint is still `169a9891619a777cea65ccd6c3bfe73e`; the Portal fingerprint
changed from `3b4c15590aff02f2e27a360d7bc23315` to
`23c966c131da883edc3b4b8463f744b9` because the approved account/relation now
exists. This is not a C5 change or a lost cooperation. The original approval
was not rewritten, and no additional approval or broader resolver migration
was silently applied to clear the conservative recheck flag.

Canonical organization-access/RLS fixtures verify active dealer access and
revocation after explicit cooperation changes. A read-only production check
as the existing unrelated 10458 dealer returned zero JE rows and zero JE
organization-scope rows. No AB Lauridsen login currently exists, so positive
external AB login acceptance was not claimed and no user was created for QA.

Verification: 40 pilot SQL/atomicity/idempotency checks, 46 cooperation checks,
75 review checks, 35 shadow checks and 139 focused UI/domain/access tests PASS.
Scoped lint, build and `git diff --check` PASS. App typecheck still fails on
the pre-existing main diagnostics; no TypeScript, dependency or compiler
configuration differs from main in this SQL-only pilot. RLS and private audit
grants were verified live. Advisor notices about the private audit table's
lack of client policies and authenticated SECURITY DEFINER RPCs are expected:
the audit is intentionally inaccessible, and both RPCs enforce Backend gates.

## Partner management and map readiness

The Backend heading is now Partnerstyring. C5/Fabric comparison is open by
default; SharePoint/import maintenance and the existing geocoding tools remain
available in collapsed sections. SharePoint is still the production profile
source, with explicit approved Portal decisions/relationships taking priority.
No SharePoint integration, scheduled job or source data is removed or disabled.

Read-only migration `20261010125045_partner_management_readiness_preview.sql`
extends the existing STABLE Backend preview RPC with canonical parent pointers
and whitelisted immutable import receipts. MCP production history version is
`20261010125902`, name `partner_management_readiness_preview`, on
`rdodyoixxybiozvmuqon`. The fixed search path and existing function ACL remain
unchanged. The Backend check fails closed, including a null result. No direct
audit/table grant, business write or import action is added.

Counts distinguish review decisions from completed import receipts validated
against the actual Portal account UUID and account number. Existing current
data: 916 C5 shadow rows, 112 Portal accounts and one completed JE receipt;
the last successful snapshot is 2026-10-10T12:26:38.520098Z. Already transferred
accounts do not reappear as pending imports. JE's conservative recheck flag
is retained rather than automatically rewriting its approval.

Opdater fra Fabric is disabled with an explicit unconnected-job status. The
existing dedicated Fabric notebook pushes snapshots; there is no configured
Portal-to-Fabric job trigger. Reload comparison remains a read-only action,
not a Fabric refresh. Overfor godkendte til Partnerdata is disabled because
the only executable importer is the previously approved fixed-account pilot.
No generic importer or broader pilot approval is inferred from that pilot.

Partner map identities still come from dealer_accounts or the existing narrow
public-map RPC, never raw C5 shadow/review rows. The same four canonical partner
types and existing role/filter rules are reused. Active filtering now also
respects is_active/status, in addition to blocked/deleted flags; inactive/all
filters retain their existing internal historical behavior. Coordinates must
be finite and within latitude/longitude bounds. Missing positions are listed
explicitly and refer to the existing geocoding tools, not a guessed location.
Warranty/demo layers and CRM leads retain their separate sources and access.

Immediately after the read-only migration all 18 protected-table checksums
matched the baseline. The existing unrelated dealer's authenticated preview
call was rejected with BACKEND_ONLY. No Portal profile, user, relationship,
CRM, Budget, Loan or SharePoint data was written by this work.

Before push the existing served preview still used the old Forhandlere heading.
After implementation commit `515f3297` was pushed, ordinary reload of that same
preview served Partnerstyring and the new primary Fabric panel. No Lovable
Build/Preview generation was triggered and no build credits were consumed.
Existing Afslut samarbejde and Skift forhandler dialogs were inspected without
submitting changes. No QA partners were created.

The live panel showed 110 registered partner-type accounts out of 112 total
Portal accounts, 915 pending reviews, zero eligible pending imports, one recheck
and one actual imported account. C5 shadow population remains 916, not a target
for Portal account creation. JE's receipt UUID matches the canonical account;
its import is not shown as a second pending import. The review-status filter
still includes its approved decision, independently of import eligibility.
Actual 390 px: panel client/scroll widths are both 350 px, document width 375 px;
legacy/geocoding sections are closed. The existing review dialog keeps source
chain 12041 -> 12040 -> 10295 separate from Portal parent 10295 and retains
approved values through recheck. It was closed without saving.
The current map returns one real Portal result for 12041, explicitly without
coordinates; raw shadow-only invoice account 12040 returns zero partner results.
No coordinate, profile, approval or cooperation write was performed.

Verification: 87 directly focused tests PASS; the broader 263-test selection
has 262 PASS and one existing Windows-CRLF literal assertion failure in
messe-partner-type-filter.test.ts. Both that test and its SQL fixture are
unchanged from HEAD. Local SQL checks: 46 pilot, 46 cooperation, 75 review,
35 shadow PASS. Build and diff check PASS. Typecheck retains the same 111
baseline diagnostics with no new errors; comparison substitutes all five
tracked changed TS files with HEAD contents in memory and normalizes only
TypeScript's expanded-interface display count for the two optional fields.
Scoped lint adds no issues; the map retains 23 existing errors and the
other changed files have zero lint errors. Actual 390 px served map and
cooperation dialog have document width 375 px and dialog width 348 px, with
no horizontal overflow. All four existing type controls were inspected.
The final checksum pass retained all business/user/relation tables; only the
independently scheduled derived Fabric Loans stock projection refreshed.

Before cutover: connect a least-privilege server-side Fabric job trigger, authorize and
verify each further controlled import scope, reconcile legacy/recheck conflicts,
and explicitly approve field/account ownership transfer with before/after and
rollback checks. Only then disable Partnerdata SharePoint writes for the exact
adopted scope, covering both manual and scheduled entry points. Other SharePoint
uses and history must remain intact.
