## Goal

Make seller initials + name come from the live `app_users` row everywhere a seller is rendered, so Alexander Kirschner shows as `AKR Alexander Kirschner` purely because his `app_users.initials = 'AKR'` — no hardcoded `AKR`, no global `AK → AKR` replacement, no bulk updates to existing CRM/dealer/order/budget/activity rows.

## Approach

Add one small client-side directory + helper that loads all Timan sellers from `app_users` once per session, then swap the surfaces that currently render hardcoded initials so they resolve through it. Legacy rows keep their stored text but display the *current* `app_users.initials` + `full_name` when the row can be matched (by email or `app_users_id`).

## Files to add

- **`src/lib/sellerDirectory.ts`** — singleton loader:
  - `loadSellerDirectory()` → one `app_users` select where role is `timan_seller`/`timan_sælger`, returns `{ id, email, initials, full_name }[]`, cached in memory + `sessionStorage` (`timan.sellerDirectory.v1`), short TTL (e.g. 5 min). Falls back silently to last cached value on error.
  - `useSellerDirectory()` — React hook returning `{ list, byEmail, byId, ready }`.
  - `resolveSellerDisplay({ email?, id?, fallbackInitials?, fallbackName? }, dir)` → `{ initials, full_name }`. If a match is found, return live `app_users` values; otherwise return the fallback text unchanged. Never invents `AKR`.
  - `invalidateSellerDirectory()` — call after backend user edit (already happens via `clearSellerIdCache`; hook into the same place).

## Files to change (surfaces only)

1. **`src/lib/activeMode.ts` — `SELLER_VIEWS`**
   - Keep the static key list (`BP / JTN / EM / AKR / NB`) so URLs and stored mode keys don't change.
   - Expose a `getSellerViewDisplay(key, dir)` that returns the live `initials + full_name` from `app_users` (matched by the static email already in the table). The hardcoded `label: 'AKR Sælger'` becomes a *fallback only*.
2. **Portal header "view as seller" menu** (consumer of `SELLER_VIEWS`)
   - Render each option through `resolveSellerDisplay`, so Alexander's row says `AKR Alexander Kirschner` from `app_users`, and any future initials change in the backend flows here automatically.
3. **`src/pages/crm/CrmCalendarPage.tsx`**
   - Replace the hardcoded `["BP","EM","JTN","AKR"]` chip list with the directory's seller initials (still filtered to the 4–5 Timan sellers via role), each chip's label resolved through `resolveSellerDisplay`. No filter logic change — chip values stay the seller's *current* initials.
4. **`src/pages/crm/CrmDashboardPage.tsx`, `SellerCockpitSection.tsx`, `SellerOverviewSection.tsx`, `SellerPerformanceSection.tsx`, budget `SellerBlock.tsx`, `DASHBOARD_SELLERS` in `useBudgetDashboardData.ts`, `UpcomingActivitiesWidget.tsx`, `CalendarActivityModal.tsx`, `BudgetReferenceModal.tsx`, dealer-accounts owner cells**
   - Wherever a seller badge / owner label is rendered from `BUDGET_SELLERS`, `TIMAN_SELLERS`, or a row's stored `seller_email` / `app_users_id`, wrap the display in `resolveSellerDisplay`. Sort / matching / scope logic (which still uses `BUDGET_SELLERS` + `sellerInitialsMatch` for AK↔AKR aliasing) is untouched.
5. **No changes** to: `sellerInitials.ts` alias map (AK↔AKR is still needed for matching legacy rows), Supabase data, RLS, scope queries, `crmCalendarService` server-side alias expansion, `BUDGET_SELLERS` constant (kept for matching), pricing, PDF, email, n8n, CRM business logic.

## Rules preserved

- No `app_users` rows are written.
- No CRM, dealer, lead, quote, order, budget or activity rows are updated.
- `AKR` is never hardcoded as a display string — it appears only because `app_users.initials = 'AKR'` for that one row.
- Other sellers (`BP`, `JTN`, `EM`, `NB`) automatically reflect whatever their own `app_users.initials` is.
- Legacy rows containing `AK` in text fields stay as-is in the database; they visually resolve to the current `app_users.initials` *only* when the row can be matched to Alexander's `app_users` record (by email or `app_users_id`). Unmatched rows display their stored text unchanged.

## Verification

- Typecheck.
- Smoke: portal header shows `AKR Alexander Kirschner`; CRM calendar chip for Alexander shows `AKR`; changing `app_users.initials` in the backend editor + reloading is reflected everywhere without code changes.

## Memory

Add `mem://features/seller-directory` documenting the rule: seller initials + names always come from `app_users` via `sellerDirectory`; never hardcode initials; never bulk-update legacy rows.