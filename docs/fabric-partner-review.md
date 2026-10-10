# Fabric Partnerdata review / import preparation

This extends the existing shadow/parity comparison, not the production
masterdata source. SharePoint remains authoritative for existing Portal data.
No import, apply, cutover, account creation or relation update is implemented.

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
