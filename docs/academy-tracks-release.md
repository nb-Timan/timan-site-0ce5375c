# Academy tracks

## Canonical model

- `academy` remains the existing opt-in module/area.
- Basic includes the existing Partnerdata and Portal Basics case IDs, once only.
- `app_users.permissions.academy_track_sales` adds the existing Sales and CRM cases.
- `app_users.permissions.academy_track_service` assigns the future Service track, with no invented cases.
- Missing Sales override retains the old eight-case curriculum; missing Service override is false.
- User saves use the existing protected admin-user-actions path. Track grants are not stored in localStorage.
- Existing case IDs and local progress keys are unchanged.
- Server completion validates the assigned curriculum and owner. Completed cycles freeze their curriculum IDs.
- View-as reads target history through the existing Backend-only RPC and never writes the actor's completion history.
- The remaining reset action clears the area/module overrides and the optional track overrides to defaults.

## Validation

- Focused Academy, access, View-as, persistence and editor tests: 197 passed.
- Production build and git diff whitespace check passed.
- App TypeScript baseline: 39 errors before, 37 after, no new errors.
- Scoped lint: nine existing errors in App, PortalPage and quick-actions-access test; no new errors. Other changed files pass with warnings.
- Migration `20260924063833_academy_track_access.sql` applied to project `rdodyoixxybiozvmuqon`; repo/live SQL parity verified.
- `supabase/tests/academy_tracks_rollback.sql` verifies assigned completion, area OFF, ownership, RLS, duplicate prevention and self-escalation using synthetic identities. Every QA write rolls back.
- RLS policies remain unchanged; anonymous completion RPC access remains denied.

## Browser acceptance pending

Edge and the in-app browser timed out before the current preview UI could be inspected. A fresh Vite process on a second port also failed to return HTTP responses. No browser acceptance is claimed. No real user's track assignments were changed.

Remaining: QA user save/reopen for Sales, Service and both; one bottom reset action; effective View-as route rejection; existing progress/counters; desktop and 390px layout. Resume on a working authenticated current-build browser, without restarting implementation.

## Changed implementation files

- src/App.tsx
- src/components/academy/AcademyTrackGuard.tsx
- src/components/portal/QuickActions.tsx
- src/lib/academyCurriculum.ts
- src/lib/academyCyclesService.ts
- src/lib/academyProductionWriteGuard.ts
- src/lib/backend-users-store.ts
- src/lib/backendUsersService.ts
- src/lib/i18n/academyTranslations.ts
- src/pages/AcademyPage.tsx
- src/pages/PortalPage.tsx
- src/pages/backend/BackendUsersPage.tsx

Tests: academy-access, academy-area-icons, academy-curriculum, academy-cycles, academy-fullwidth-dashboard, academy-cycle-view-as, academy-track-guard, academy-track-persistence, academy-tracks, backend-user-permission-grouping and quick-actions-access, plus the SQL rollback test and migration above.
