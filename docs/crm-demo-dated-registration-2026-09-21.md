# Dated CRM demo registration

## Canonical rules

- `Customer requests a demonstration`: 40%; no scheduled-demo warning by itself.
- `Demonstration scheduled`: 50%, enforced against a dated, non-cancelled
  `crm_demo_leads` row with the same `source_lead_id`.
- `Customer wants a demonstration` and `Demo agreed` remain readable aliases,
  not additional active choices. Historical activity text is not rewritten.
- Selecting scheduled on an existing lead opens the existing demo form.
  Starting an unfinished registration records one canonical activity and sets
  `demo_registration_pending`; a valid demo clears it.
- Existing linked demos are reused through the lead's demo section. The
  existing unique source-lead and calendar indexes remain in force.
- Demo date, lead follow-up and expected close are independent. Only an
  explicitly edited follow-up is passed as `update_followup=true`.
- Calendar owner initials, atomic create and completed-demo history fixes from
  c5646118 remain intact. Cancelling/removing a demo invalidates its scheduled
  state and cancels its calendar entry.

## Root cause

The activity list exposed both requested aliases and allowed scheduled as an
ordinary field value. The create RPC and calendar trigger both assigned demo
date to lead follow-up. No server constraint required scheduled evidence, and
no completion indicator represented an unfinished demo-registration flow.

## Live audit / compatibility

Before applying these changes, there were no canonical `crm_demo_leads` rows
and no active `Customer wants a demonstration` or `Demo agreed` rows after
the previous isolated QA cleanup. No speculative historical dates were restored.

Three legacy leads have `status='Demo planlagt'` without a linked dated demo:
G-5005, G-5098 and G-5181. G-5098 also has `demo_has_run='yes'`.
These ambiguous legacy status strings are unchanged. Current next-activity
and completed-demo logic remain authoritative; no dated registration is invented.

## Migration parity

- 20260921144341_enforce_dated_crm_demo_registration
- 20260921144840_crm_demo_delete_calendar_parity

Both applied successfully. Existing RLS policies/grants are unchanged; new RPCs
are authenticated/invoker-scoped. Internal trigger functions are not callable
by anon/authenticated clients. No parallel lead/demo/history/calendar table.

Repo/live SQL hashes match after normalizing line endings/trailing newlines:
`b1c300c630b5ba70de80f0b87a289749` and `d48f0181ef19101357e1f02935238877`.
Each migration name occurs once in live history. QA rollback rows remaining: 0.

## Verification

- 80 targeted tests passed (14 files): lifecycle, stage, warning UI, nine-language
  labels, scope/View-as resolver, Quick Notes and prior audit/calendar fixes.
- `supabase/tests/crm_demo_registration_rollback.sql`: PASS against live functions
  using real AKR, EM and Backend authenticated claims, with all writes rolled back.
- Covers mandatory date, forged scheduled state, idempotent start, one source
  lead/demo/calendar, three independent dates, explicit follow-up, date history,
  completion history, cancellation, Backend deletion, seller delete restriction,
  cross-seller denial, list warning projection and new-lead creation.
- Build: PASS. Diff check: PASS.
- Typecheck: 27 pre-existing errors; no new error in the changed implementation.
- Full-source lint: 192 pre-existing errors / 159 warnings, unchanged baseline.
  Focused lint of new helpers/components/tests: PASS.
- Authenticated MCP: AKR session confirmed. Final acceptance of the new frontend
  must use the released build; it is not inferred from database/unit tests.

No email or external calendar invitation is sent by these QA checks.

## Public MCP acceptance: deployment blocked

After pushing code commit `334790bf`, authenticated Edge was reloaded on an
existing AKR-scoped lead. The fully rendered activity selectors still contained
both `Customer requests a demonstration` and `Customer wants a demonstration`,
and scheduled was still stored as `Demo agreed`, not `Demonstration scheduled`.
The observed entry asset was `/assets/index-Bk8FupjF.js`.

This proves the public frontend does not contain this release. Its exact commit
is not exposed in the UI and is not guessed. Only read-only MCP inspection was
performed on this production lead; no save or demo conversion was triggered.

Remaining acceptance after publishing `334790bf` or newer:
requested 40/no warning -> scheduled selection opens same-lead form -> missing
date blocked/warning -> dated save 50/warning cleared -> verify three independent
dates, same lead/demo/calendar, reload, then safe QA cleanup. Do not claim MCP
end-to-end PASS from the successful rollback integration tests.
