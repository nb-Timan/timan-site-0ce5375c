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
missing source facts invalidate approvals dynamically; outdated approvals stay
in history but do not enter the import queue. Context hashes used for editor
concurrency are parent-free; saved/current review hashes include parent facts.

## Business boundaries

Known types remain 1/A dealer, 2/B service partner, 3/C importer, 5/E dealer
customer. Unknown codes require an explicit manual type and documented reason.
An existing Portal type conflict cannot be approved for automatic conversion.
Dealer customers require an explicit existing eligible Portal dealer; invoice
chains are evidence, never automatic parent/billing writes.

Only company name, address lines, postal code, city and country can be chosen
for later import. UUID, seller, phone/email, billing, user access, relations and
Portal-owned operational metadata are not writable through this review RPC.
Unparsed C5 ZIPCITY cannot be approved as postal code/city. Existing accounts
enter the changes queue only when a chosen C5 field actually differs.

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
