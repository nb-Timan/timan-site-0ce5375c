# JE Service reconciliation and Rostofte legacy correction

## Scope and approval boundary

Canonical project: rdodyoixxybiozvmuqon. No general import or SharePoint cutover.
JE Service reconciliation is authorized. Rostofte production access changes are
NOT authorized yet; the legacy migration and switch remain pending approval.

## JE Service

Existing account: aa88f1a3-a7bd-4e85-bc86-9e80175ac7ba (12041).
Approval version 7: 032e3450-873e-4669-bd00-0b06db506349.
Import receipt: 6dbd5603-86a8-4e0f-97fa-ff9cb3369b55.
Active relation: 395f3ef9-7012-4b0d-9885-227b4b118ebc.

The immutable review stored the pre-import parent-only Portal fingerprint.
Creating the approved account and relation necessarily changed that fingerprint.
The fix records verified materialization separately, without rewriting approval,
receipt, original source facts, UUID, profile or relation. Canonical hashing is
reused; source changes and later Portal/cooperation changes still require review.
The attestation helper is private to the database owner, not a client RPC.

Local migration: 20261010140258_partner_import_materialization_evidence.sql.
Production migration version: 20261010141341 (same named migration).
Applied successfully; one append-only materialization record, seven original
review versions retained, needs_recheck=false.

Unchanged live Fabric refresh: 916 accounts, snapshot
22b20fd8-fcd0-40cf-b2ce-7f8f3db63aea, completed 2026-10-10T14:15:59.76514Z.
JE approval remains active, needs_recheck=false, same account and relation.
No real source changes were manufactured in production.

## Rostofte final dry-run (not executed)

Account 10363: 972daa05-bfd2-4ee7-b128-3bb687e64666.
Observed parent 10138: e4c1ce9b-cbe4-4236-8a56-1060c92a6de3.
Proposed parent 10295: bc6ae72c-b653-4995-a446-dfdd540b01d1.
C5 type 5, invoice account 10295. Existing seller EM.
No saved Backend review, cooperation event or canonical customer-relation row
exists for 10363. The old pointer must not be presented as a historic relation.

Pending migration: 20261010140302_rostofte_legacy_cooperation_correction.sql.
It changes definitions only; no existing account/relation rows are changed by
applying it. It depends on the JE evidence migration above.

After explicit approval, one atomic, Backend-only, version/fingerprint-checked
call will:

- Update only the existing account's parent_account_number: 10138 -> 10295.
- Insert one APPROVED review decision; all six profile choices use PORTAL.
- Insert six immutable field-evidence rows and two original invoice-chain rows.
- Insert one permanent AB Lauridsen -> Rostofte customer relation.
- Insert one SWITCH event with old parent/dealer, previous_relation_id=NULL and
  previous_relation_origin=OBSERVED_LEGACY_POINTER. No historic start is invented.
- Insert one append-only post-switch materialization, preventing false recheck
  from this explicitly approved operation itself.

Total: one existing account-field update, twelve inserted evidence/relation rows,
zero new accounts, zero deleted rows, zero login/user changes.
Retries return the same event and do not duplicate approvals or relations.

Existing relational RLS removes Kolding's old customer access and grants the
corresponding AB customer scope. Existing historical CRM/order linkage remains
unchanged; no historic document ownership is rewritten.
Kolding remains Service Partner and retains its 50532 pointer.
AB's 10285 and 12041 relations remain untouched.

## Verification

- 180 focused UI/domain/CRM/View-as tests PASS.
- JE import/evidence SQL: 62 PASS.
- Cooperation/legacy/RLS/audit SQL: 79 PASS.
- Review persistence SQL: 75 PASS.
- Shadow/RLS SQL: 35 PASS.
- Scoped lint PASS. Production build PASS. git diff --check PASS.
- Typecheck: 111 existing diagnostics in both base main and changed tree;
  zero added diagnostics. Full typecheck is not green.
- Real components in read-only isolated browser fixture verified at desktop
  and actual 390 px, no horizontal overflow. This is not production switch proof.
- Protected account/user/relation/CRM/configuration/Budget/Loan/media checksums
  remain unchanged. The independently scheduled Fabric loan projection refreshes
  normally; this implementation has no write path to it.

Production Rostofte acceptance and final close are pending explicit approval.

## Final browser verification

The existing served Lovable preview subsequently picked up the pushed correction
without triggering Build/Preview generation. JE shows APPROVED, original review
version 7, active parent 10295, one cooperation-history event, and recheck count 0.
Live desktop and actual 390 x 844 verification PASS; dialog scrolls internally,
no horizontal overflow. Lovable credits consumed by this task: 0.

JE SERVICE READY TO CLOSE: YES.
ROSTOFTE READY TO CLOSE: NO, pending the exact production migration/switch approval.

## Changed files

- src/lib/fabricPartnerReview.ts
- src/test/fabricPartnerReview.test.ts
- scripts/test-je-service-import-pilot.mjs
- scripts/test-partner-cooperation.mjs
- scripts/partner-cooperation-browser-fixture.mjs
- supabase/migrations/20261010140258_partner_import_materialization_evidence.sql
- supabase/migrations/20261010140302_rostofte_legacy_cooperation_correction.sql
- docs/partner-je-rostofte-closure.md
