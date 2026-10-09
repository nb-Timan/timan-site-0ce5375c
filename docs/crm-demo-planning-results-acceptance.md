# CRM demo planning and results acceptance

Date: 2026-09-23. Baseline: `dc1e664a`.

## Canonical contract

- `crm_leads` remains the opportunity; `crm_demo_leads.source_lead_id` remains its demo relation.
- Preserve the existing unique demo-per-source index and demo calendar index. No parallel model.
- Planning uses one scoped transaction for lead assignment, existing/new lead, demo and calendar.
- Result fields remain null while planning. Completion requires an explicit validated result.
- Future/today: scheduled. Past without completion: awaiting result. Explicit completion: completed.
- Lead completeness is independent and preserved. Existing source/provenance is not rewritten.
- Standalone creation preserves the existing `crm_demo_registration` activity provenance.
- Demo date, lead follow-up and expected close remain separate.
- Production lead detail has one Demo section. Academy keeps its existing local flow.
- New labels use the existing nine portal language keys.

## Database release

Applied to canonical project `rdodyoixxybiozvmuqon`:

- `20260923112318_crm_demo_planning_and_results.sql`
- `20260923114023_crm_demo_scheduled_followup_validation.sql`

Migration history and normalized statement content match the repository.
New RPCs are security invoker, authenticated only; anonymous execution is denied.
No RLS policies were relaxed. Only actual Backend can supply another effective actor.

Browser regression found: Quick Note rejected `Demonstration scheduled` with
`22023: Unsupported next activity`. The existing RPC whitelist omitted the canonical
scheduled-demo activity. The second migration adds that value without replacing the
follow-up transaction, probability mapping, permissions or calendar model.

## Real MCP acceptance

Authenticated Edge, local current build at `http://127.0.0.1:4188`, effective AKR seller.
This is not a claim that the public deployment already contains this release.

- A: Existing TEST Messe lead without dealer, one Demo section, prefill, scoped Tiefel
  selection, manual demonstrator, future date, save under same lead: PASS.
- B: Standalone TEST registration creates one lead and one demo; lead appears once
  in overview and has canonical demo-registration provenance: PASS.
- C: New-demo existing-lead selector, source prefill, known contact, same source id,
  one linked demo, reopening retained source number: PASS.
- D: Reschedule to past date without results shows awaiting result, not completed: PASS.
- E: Empty result defaults; explicit interest/offer/result/probability/notes/follow-up
  save; completed status after reload; one held history event/calendar: PASS.
- F: Demo reschedule retains follow-up/expected close. Quick Note follow-up change
  retains demo date. Whitelist fix retested in the real browser: PASS.
- G: View-as AKR dealer list contains assigned accounts; owner remains AKR. Backend
  global scope is not used as evidence for seller access: PASS.
- Known dealer contact to known portal user retains only one representative reference: PASS.
- Danish and German new demo labels; desktop and 390 px detail without overflow: PASS.

SQL rollback test additionally verifies actual authenticated AKR, cross-dealer rejection,
cross-seller rejection, forged View-as rejection, Backend View-as isolation, duplicate
rejection, preserved completeness/source, result idempotency and one calendar/history event.

## QA cleanup

Isolated browser QA: L-1126 / D-8021, L-1127 / D-8022, L-1130 / D-8025.
No commercial documents or customer mails were created.
All three leads were removed through `delete_crm_lead_permanently` after checking their
exact IDs, TEST titles and absence of linked commercial documents. Associated demos,
notes and calendars were cleaned; normal append-only audit remained.
Post-cleanup counts: QA leads 0, QA demos 0, QA calendars 0; total demo count returned
to baseline 0. Rollback SQL fixtures left no records.

## Validation

- 131 tests across 26 focused CRM/demo/calendar/View-as files: PASS.
- Live transaction/permission rollback tests: PASS.
- Production build and `git diff --check`: PASS.
- Typecheck: 33 existing diagnostics, same file/error-code multiset as baseline;
  no new diagnostics. The repository-wide typecheck is not green.
- Scoped lint: five pre-existing `no-explicit-any` errors (four service, one overview),
  confirmed identical against baseline. No new lint errors; hook warnings remain.

Unrelated baseline typecheck/lint cleanup is outside this CRM demo task.
