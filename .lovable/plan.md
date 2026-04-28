# CRM / Sales Portal — access model plan

Status: **foundation only**. No CRM dashboard built yet. This document
records the agreed access rules and the data model added in Phase 3.

## Goal

Timan Sælger users must only see and manage data connected to their own
assigned accounts (dealers, importers, service partners, dealer users) and
their own offers/orders.

## Roles & visibility

| Role                  | CRM scope                                |
|-----------------------|------------------------------------------|
| Timan Backend         | Sees everything (admin)                  |
| Timan Service         | Sees everything (admin, read-mostly)     |
| Timan Sælger          | **Only** assigned accounts + own offers/orders |
| Timan Importør        | Not part of CRM (uses dealer portal)     |
| Timan Forhandler      | Not part of CRM                          |
| Timan Service Partner | Not part of CRM                          |
| Dealer User           | Read-only, not part of CRM               |

Timan Sælger:
- Can create offers/orders.
- Can only see their own offers/orders.
- Can only see dealers/accounts assigned to them.
- Can see dashboard stats for their assigned accounts.
- Cannot see other salespeople’s accounts unless explicitly allowed
  (`extraAccountIds` allow-list in `SellerScope`).

## Data model (Phase 3)

SQL: `docs/sql/phase3_crm_account_owner.sql` (idempotent, run in Supabase).

`public.app_users` gets:
- `account_owner_user_id  uuid → app_users(id)`
- `account_owner_name     text`
- `account_owner_initials text`
- `account_owner_email    text`
- Trigger `sync_account_owner_fields` keeps the denormalised fields in
  sync whenever `account_owner_user_id` changes.

`public.configurations` (offers/orders) gets:
- `assigned_seller_id  uuid → app_users(id)`

View `public.crm_accounts_view` exposes the dealer-side rows with their
owner fields, used later by the CRM list pages.

## Frontend foundation

`src/lib/crmScope.ts` — pure helpers:
- `isScopedSeller(role)`, `isCrmAdmin(role)`
- `canSellerSeeAccount(scope, account)`
- `canSellerSeeOffer(scope, offer)`
- `filterAccountsForSeller(scope, rows)`
- `filterOffersForSeller(scope, rows)`

These will be wired into list pages when the CRM area is built. Today
they are imported nowhere by default (zero behaviour change).

## Backend Users page

`src/pages/backend/BackendUsersPage.tsx` gets a new "Account Owner" select
in the edit modal so a Timan Backend user can assign any dealer / importer
/ service partner / dealer user to a Timan Sælger. Saving goes through
`saveBackendUser` → `app_users` (full patch, with the existing graceful
fallback if columns are missing).

## Future CRM area (NOT built yet)

Planned routes (placeholders only):
- `/portal/sales/my-dealers`
- `/portal/sales/my-importers`
- `/portal/sales/my-service-partners`
- `/portal/sales/my-dealer-users`
- `/portal/sales/offers`
- `/portal/sales/orders`
- `/portal/sales/activity`
- `/portal/sales/stats`

Out of scope for this phase. Pricing, configurator calculations,
order/PDF logic, n8n flows and login/auth are untouched.
