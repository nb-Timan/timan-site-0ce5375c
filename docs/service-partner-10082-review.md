# Cooperation is independent of C5 billing

Status: implementation and isolated QA prepared; production migration and
Reesink → #10082 activation are **not applied**. The production schema release
was rejected by automatic approval review because it changes functions,
triggers, audit columns and authenticated RPC permissions. Obtain explicit user
approval for that release and for the concrete relation before retrying.
No Lovable build or credits were used.

This continues the local Servicepartner preparation at `845f77dd`, reusing its
verified account identities, dry-run helper, tests and browser fixture. The
earlier unresolved own-billing question and customer-only server blocker are
superseded by Timan's business clarification and this typed extension. Blank INVOICEACCOUNT is
not a conflict and must not be converted to a fabricated C5 value.

## Canonical implementation

Reuse `partner_account_relations` and the append-only
`partner_cooperation_events` ACTIVATE/END/SWITCH lifecycle. Add typed relation
metadata to the existing audit, not another relation/draft table. The typed RPC
requires an approved, active Timan Backend actor, explicit new-relation
confirmation, reason, expected version and idempotent request ID. END/SWITCH
also identify the exact active edge. A main partner is unique; separate
`service_partner_has_dealer` service-network edges retain many-to-many semantics.
Hierarchy ancestor checks prevent cycles, including legacy parent pointers;
service-network edges are not hierarchical parent edges.

Supported existing types:

| Source | Target | Canonical type |
|---|---|---|
| Importør | Forhandler | importer_has_dealer |
| Importør | Servicepartner | importer_has_service_partner |
| Importør | Forhandlerkunde | importer_has_dealer_customer |
| Forhandler | Servicepartner | dealer_has_service_partner |
| Forhandler | Forhandlerkunde | dealer_has_dealer_customer |
| Servicepartner | Forhandlerkunde | service_partner_has_dealer_customer |
| Servicepartner | Forhandler | service_partner_has_dealer |

C5 invoice fields are read-only evidence, never an eligibility condition. No
cooperation mutation writes `billing_account_id`, C5 records or seller fields.
The existing customer access pointer remains compatible for Forhandlerkunder;
servicepartner/dealer/importer account rows are not updated by cooperation.
Approved edges, including ended edges, cannot be silently changed/reactivated
by refresh, legacy mutation or direct deletion. Unmanaged non-customer legacy
edges retain their compatibility path and existing RLS. Editing unchanged
hierarchy in Partnerdata does not rewrite an approved edge through the legacy
billing/hierarchy RPC.

Backend Partnernetværk uses one approval/end/switch/history dialog for all
canonical types. Existing-partner Fabric review opens that same separate
operational approval without saving profile/import choices. Both views display
C5 billing separately. Partnerdata uses its existing scoped relation loader,
visibility rules, canonical partner labels and Samarbejdspartnere panel.

Until database release, new types are visibly disabled for saving. Existing
Forhandler → Forhandlerkunde operations retain the established guarded RPC only
if the typed endpoint is absent. Permission/state errors never use that
compatibility path; other types never use the customer-only endpoint.

## Read-only production evidence, 2026-10-10

| Account | Portal UUID | Type | Seller | Parent / billing pointer | C5 INVOICEACCOUNT |
|---|---|---|---|---|---|
| Reesink #10151 | b6f4657a-6cc7-423d-b64d-dba372c96fd5 | Forhandler | EM | null / null | null |
| Have og Park Center Svendborg #10082 | dcbfec99-6793-4d1c-bef6-c4219e1e4c6e | Servicepartner | EM | null / null | null |

There is no saved #10082 Fabric review approval and no relation touching either
account. Global baseline: 4 relation rows and 2 cooperation events. No
`app_users.dealer_number` is linked to either account. Timan explicitly confirms
#10082's own billing despite blank C5 INVOICEACCOUNT; the UI still displays the
source field as blank rather than presenting inferred C5 evidence.

Whole-account `md5(row_to_json(d)::text)` baseline (same expression on recheck):
#10082 `d22085564c9a39c02ada453d26e99065`,
#10151 `ca0491203181a2ed6da2cfcbd3ac5dda`.
Neither the rejected release nor local tests change production account rows.

## Concrete dry-run and access consequences

Proposed ACTIVATE, expected target version 0:
`10151 → 10082`, `dealer_has_service_partner`, explicit confirmation and reason
"Timan har bekræftet samarbejde under Reesink. #10082 faktureres fortsat direkte
på egen konto. EM bevares."

Planned writes after approval: one relation edge and one audit event, with
server-generated IDs. Zero account/profile, billing, C5 or user writes.
CRM, leads, quotes, orders, budget, contracts and contacts are not rewritten.
No existing approvals or access roles are fabricated.

The current production `resolve_collaboration_manager_accounts()` includes an
active outgoing commercial relation's target. Its existing policies can give a
Reesink approved active `collaboration_manager` visibility of #10082's partner
record, linked leads/demo leads, configurations, CRM activities and external
organization users. Existing WITH CHECK rules continue to govern writes.
This is a real access consequence to approve, not merely a visual grouping.
There are currently no linked users at either account, so none receives an
immediate role change. Own-company users receive no new reverse-parent scope.
END/SWITCH removes former relation-derived scope; unrelated independent access
is unaffected. Billing alone never creates this edge or its access scope.

## Release and activation approval boundary

1. Review and explicitly approve only
   `20261010184027_cooperation_independent_of_billing.sql`. It contains no
   production activation call or data import. Do not automatically apply the
   separately pending billing-branch migration.
2. Apply this single approved migration through the existing Supabase release
   mechanism. Recheck function ACLs/RLS, unchanged accounts/relations/events and
   security advisors. Existing RLS policies/resolvers are not replaced.
3. Obtain explicit approval for the concrete Reesink → #10082 access consequences
   above. In Timan Backend choose those verified accounts, canonical type,
   documented reason and explicit confirmation; use the typed lifecycle RPC.
4. Recheck actual Backend and Partnerdata at desktop and 390 px, unchanged own
   billing/EM and the recorded actor/date/reason/version.
5. If the relationship must be undone, use END on its exact active edge with
   current version and a reason. Preserve audit; never delete business history
   or restore pointers from INVOICEACCOUNT.

## Verification / reproduction

- `node scripts/test-partner-cooperation.mjs`: 118 real PostgreSQL/PGlite
  lifecycle, permissions, history, refresh and integrity checks, using the
  production organization scope resolver.
- `node scripts/test-fabric-partner-review.mjs`: 75 existing checks.
- `node scripts/test-billing-branch-relations.mjs`: 36 existing checks.
- Focused Vitest: cooperation dialog/page/service, Servicepartner dry-run/review
  entry, Fabric review/comparison, canonical types, billing separation,
  Partnerdata scope/list and Academy regression: 155 tests PASS in 14 files.
- `npx tsc --noEmit -p tsconfig.app.json`: baseline 110 existing errors; compare
  normalized error text, zero new errors. Scoped ESLint: zero errors, four
  existing CRM hook warnings. `npm run build` and `git diff --check` pass.
- `node scripts/service-partner-review-browser-fixture.mjs`:
  `http://127.0.0.1:5225/` real review and approval dialog;
  `/?schema=pending` verifies the disabled-save state before database release;
  `/backend` real network page with expected approved edge;
  `/partnerdata` the unchanged embedded Portal panel extracted from current
  source for isolated rendering. All API writes throw; no production session
  or network connection. Future expected state is explicitly labelled QA.
  Desktop 1440×1000 and mobile 390×844 verified without horizontal overflow;
  review selection, relationship controls and Partnerdata tap work.
  Stop the fixture process after use.

Supabase security advice was reviewed read-only. Existing advisor findings are
not expanded into this task; restricted audit tables intentionally have no
client policies. See [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
for execution and policy boundaries.
