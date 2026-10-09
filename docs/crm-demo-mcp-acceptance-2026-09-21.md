# CRM demo request/scheduled QA acceptance

## Scope and browser evidence

- Public portal: https://timan-site.lovable.app, real Edge MCP interaction.
- Authenticated NB session, View-as AKR seller; same pre-existing isolated TEST lead L-1116 throughout.
- No offer/order/mail submission or Outlook webhook was invoked.
- Initial lead: requested demo, 40%, follow-up 2026-10-01, expected close 2026-11-12.
- The first browser Save failed atomically: no demo or lead update committed.

## Exact defects and minimal fixes

1. PostgreSQL 42703: `record "new" has no field "customer_type"` in
   `audit_crm_lead_change()`, called by the demo insert. The shared audit function
   read a lead-only column on the demo table. Nullable JSON extraction now supports
   both record shapes for insert, update and delete; actor/payload/audit behavior is retained.
2. `append_crm_demo_held_history()` had its new-value guard inverted. A no-to-no
   update created false completed history and completed the scheduled calendar event.
   Only an actual non-yes-to-yes transition now emits completed history.
3. `sync_crm_demo_calendar()` omitted `seller_initials`, while the existing calendar
   query filters by these initials. It now derives the snapshot from the canonical
   `app_users` row identified by `owner_user_id`, on both insert and upsert.

No RLS policies, grants, role rules, mail logic or production lead backfill were changed.
Pre-existing non-QA history was not rewritten.

## Verified results

- Browser Save succeeded and navigated to the SAME L-1116, with success toast.
- Final test demo D-8011: 93c89f71-9575-4b6b-9c23-a27ceaa10aaa.
- Lead: 8d89a57a-3690-447c-b531-6eca0b41f46b; owner AKR; dealer Tiefel 10458; RC-751.
- Scheduled stage: Demo agreed / 50%; `demo_has_run = no`.
- Demo date and canonical next follow-up: 2026-10-17.
- Expected close: 2026-11-12, unchanged throughout.
- Browser reload showed persisted stage, dates, D-8011, and one Demo aftalt history entry.
- No false Demo afholdt event after the guard fix.
- One calendar event: 643871b8-97d5-4af8-9590-804b4091265d, planned, owner AKR.
- Browser date changes reused the same demo and calendar IDs; no duplicate rows.
- Browser calendar showed the TEST event once on 17 October; opened detail showed
   the correct title, date, AKR, TEST notes and planned status. Closed without saving.
- Duplicate RPC attempt was rejected by `crm_demo_leads_one_source_lead` (23505).
- Authenticated AKR SQL transaction tests (rolled back) verified both undated
   requested/40% and dated agreed/50%, including calendar owner initials.
- All 9 null/no/yes completion transitions tested against the live trigger inside
   a rollback transaction; only non-yes -> yes created completed history.

Calendar editor follow-up observation: the existing dealer chooser displayed
`Ingen forhandler` despite the persisted account_id and correct Tiefel calendar
tooltip. This editor was not saved or changed; the tested demo/lead/account relation
was correct. No general calendar-editor behavior is claimed by this acceptance.

## Cleanup

The first QA result was removed before the final browser retest. Final cleanup
checked exact TEST identity, dummy email marker, expected close, demo ID, absence
of offer/configuration lineage, share/budget lineage and external Outlook event.
Only the isolated QA lead, demos and calendar records were removed. Normal history
retention and audit triggers stayed enabled. Final database counts:

- TEST leads: 0
- TEST demos: 0
- TEST calendar events: 0
- Retained audit events for final lead/demo: 19

Sequence gaps from failed/rolled-back tests are expected; sequence values were not reset.

## Release validation

- Targeted tests: 28/28 PASS across eight demo test files.
- Production build: PASS.
- Changed test-file lint: PASS.
- Full source lint: existing 192 errors / 159 warnings; no application TS/TSX changed.
  The first unbounded lint also scanned local worktrees and was stopped; the completed
  run excluded `.codex-worktrees/**` and `tmp/**` without changing lint configuration.
- App typecheck: existing 27 errors outside these added tests; not reported as PASS.
- Migration versions below were applied live and reconciled to repository filenames.

## Migrations

- 20260921135240_crm_demo_audit_optional_customer_type
- 20260921135656_crm_demo_held_transition_guard
- 20260921141040_crm_demo_calendar_owner_initials

Each migration replaces only the verified expression/mapping in the existing function
and fails if its expected baseline is absent. Existing function security mode and grants
are preserved. No schema/table or policy additions.
