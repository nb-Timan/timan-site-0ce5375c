# Order revision / confirmation audit

## Root cause and canonical data

O-7010 has one active machine unit. Revision 3 AFTER retains an unused
`individualUnitConfigs.m0_2` draft after the quantity was reduced to one.
`buildAccountCaseLines` previously merged accessories from every matching unit
key, whereas totals used the active quantity. This rendered an extra 725142
and its accessories without including them in the subtotal. It was not a merge
of expired revision AFTER snapshots: revisions 1 and 2 have no AFTER.

- Original BEFORE: one Loader Line unit with 725142 and accessories; stored
  configuration total 50,025 DKK. It has no frozen pricing totals.
- Latest completed: revision 3, completed 2026-09-21 07:41:03 UTC.
- Active priced lines: 725135 (60,800), 712902 (1,150), 725312 (3,600),
  725120 (950), 725747 (3,800). The zero-priced machine heading remains.
- Subtotal 70,300; discount 17,575; total 52,725 DKK.
- Stored stale drafts and PO values are preserved, but removed machine units
  do not contribute lines or PO labels to the current document.

## Implementation

- A scoped RPC chooses the latest completed AFTER, ignoring incomplete and
  expired sessions. Without a completed session it selects the earliest BEFORE,
  or the original configuration if no correction session exists.
- Read-only confirmation and Configurator revision hydration use that document,
  without merging current configuration columns into its state.
- One validated document supplies displayed lines, subtotal, discount, total,
  PDF and revised-mail product data. Inconsistent or missing historical prices
  produce a controlled error instead of catalogue repricing.
- New pricing snapshots preserve complete commercial lines as well as prices.
- Save-only remains the existing revision save path. Generate/send completes
  the revision first, reads its persisted AFTER, and generates a versioned PDF.
- Revision PDFs and confirmation timestamps are stored on the revision;
  original order submission timestamps and original PDF pointers are unchanged.
- A database send claim and immediate client guard prevent duplicate dispatch
  of the same revision. An uncertain send is not automatically retried.
- Backend-only writes and effective-user restrictions are explicitly checked
  by the RPC. Sellers can read only their scoped orders; external users cannot.

## Live migration and data preservation

Migration: `20260921125455_canonical_submitted_order_confirmation`.
Live and repository SQL match (live migration history includes one extra
trailing CRLF, with no SQL difference). No new business-data table.

O-7010 hashes before and after all rollback checks:

- Configuration: `85051821ac413b5d653078cad84334bc`
- Each original BEFORE: `14ea781ed8d043aca7269cecd99a0ebf`
- Revision 3 AFTER: `7389551b5afb050a9d0625eae56c20bf`
- Revision 1/2 AFTER: null, unchanged.

`supabase/tests/submitted_order_confirmation_rollback.sql` passed against live:
latest completed, incomplete/expired exclusion, original fallback, unique send
claim, immutable snapshots, unrelated seller isolation, View-as external denial,
and Backend-only confirmation writes. All test mutations were rolled back.

Supabase advisors flag the two intentional authenticated SECURITY DEFINER RPCs.
They have fixed search paths, explicit role/ownership checks, and no anonymous
execute grant. The correction table remains RLS enabled with no direct access
policies, intentionally accessible only through guarded functions.

## Validation and remaining acceptance

- Targeted order/revision/pricing/PDF/mail/customer/payment and normal
  Configurator calculation tests: 82/82 pass in 16 files.
- Production Vite build passes; `git diff --check` passes.
- Real application typecheck has 27 existing diagnostics on HEAD and the same
  27 on the worktree, with no introduced diagnostic in the baseline comparison.
- Repository lint is not globally clean (192 pre-existing errors in the scoped
  full run excluding temporary/nested worktrees). Changed-file comparison:
  44 before, 44 after, no new error. New document helper/UI tests lint cleanly.
- Authenticated Edge MCP reproduced the old O-7010 duplicate line set and
  verified that revisions 1, 2 and 3 remain visible. Backend and Seller controls
  were inspected. The public frontend did not yet contain this release.
- O-7011 was checked read-only: total 50,025 DKK, one unit, no pricingSnapshot.
  Legacy prices cannot be invented. Its saved PDF and business data are untouched;
  the new view gives a controlled historical-pricing warning.

NOT yet verified in the deployed frontend: corrected O-7010 modal, QA revision
save/generate/send end-to-end, actual revised email/PDF delivery and mail audit.
No mail was sent, no QA order was created, and no order/customer data was changed
by this audit. Do not report full MCP or email acceptance until a deployment of
this release is available and those checks have actually run.
