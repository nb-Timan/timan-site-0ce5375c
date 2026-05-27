
# Machine Lifecycle Platform — Inspection & Phased Plan

Scope of this step: **inspection + plan only**. No code, no SQL, no DB, no behavior changes to Claims/TSB/Warranty/Serviceinformation/Service registration.

---

## 1. Inspection report

### 1.1 Teknik & Service structure
- **Cards rendered by:** `src/pages/PortalAreaPage.tsx` (area `teknik_service`).
- **Card catalog:** `src/lib/portalAreas.ts` (`placeholders` array). Real modules also pulled from `src/lib/portalModules.ts`.
- **Routes:** all defined centrally in `src/App.tsx`:
  - Claims → `/portal/service/claims*`
  - TSB → `/portal/service/tsb*` (wrapped in `TsbAccessGuard`)
  - Warranty → `/portal/service/warranty*`
  - Serviceinformation → `/portal/service/information`
  - Service registrering og vedligehold → `/portal/service/maintenance`
- **Adding a card:** push entry to `PORTAL_AREAS[teknik_service].placeholders`, then map its `key` to `href`/`icon`/`description` in the `PlaceholderCard` switch inside `PortalAreaPage.tsx`. Module-access gating goes through `hasModuleAccess(role, key, override)`.
- **Icons:** `lucide-react` imported at top of `PortalAreaPage.tsx`.
- **Translations:** inline `Record<Language, string>` on each placeholder; page-level UI strings use `useLanguage()` + local `T` maps. Bigger pages use `src/data/translations.ts`.

### 1.2 Claims
- **Pages:** `src/pages/ClaimsPage.tsx` (role router) → `src/pages/claims/{Admin,Dealer}Claims*Page.tsx`, `ClaimDetailPage.tsx`, `NewClaimPage.tsx`.
- **Shared UI:** `src/components/claims/{ClaimTool,ClaimsAdminSidebarLayout,ClaimsDealerView,ClaimsInternalView}.tsx`.
- **Service:** `src/lib/claimsService.ts` → Supabase table **`service_claims`**.
- **Fields available for linking** (from claimsService usage): `serial_number`, `machine_type`, `dealer_*`, `customer_*`, `status`, `created_by`, plus uploads/comments stored on the row or in related store.

### 1.3 Warranty / Garantiregistrering
- **Pages/components:** `src/pages/WarrantyPage.tsx`, `src/components/warranty/{WarrantyAdminSidebarLayout, WarrantyDashboardBody, WarrantyNewForm, WarrantyRegistrationsTable}.tsx`.
- **Storage:** `src/lib/warranty-store.ts` — currently a local/seed-based store (`warranty-seed.json`), **not yet a Supabase table**. Stores serial_number/machine_number per registration.

### 1.4 TSB
- **Pages:** `src/pages/tsb/*` (Dashboard, List, New, Detail, Dealers, Machines, Users, Countries, Settings) gated by `TsbAccessGuard`.
- **Layout:** `src/components/tsb/TsbSidebarLayout.tsx`.
- **Storage:** `src/lib/tsb-store.ts` — local store, **no Supabase table yet**. Has machine-type linkage; no enforced serial_number link.

### 1.5 Service registrering og vedligehold
- **Pages:** `src/pages/ServiceMaintenancePage.tsx` + `src/components/service/ServiceMaintenanceSidebarLayout.tsx`.
- **Service:** `src/lib/serviceMaintenanceService.ts`.
- **Confirmed Supabase tables (phase43 + parts migration):**
  - `public.service_machines` (serial_number, machine_type, dealer_number, dealer_account_id, customer fields, hours…)
  - `public.service_registrations` (machine ref, technician, hours, interval, totals, notes…)
  - `public.service_intervals`
  - `public.service_registration_parts` (FK → service_registrations, source_type servicekit|extra)
- All four tables already key on `serial_number` + `dealer_number` / `dealer_account_id`.

### 1.6 Access control
- **Helpers:** `src/lib/portalAccess.ts` — `PortalRole`, `derivePortalRole`, `hasModuleAccess`, `DEFAULT_MODULE_ACCESS`, `getPortalPermissions`, `getClaimsViewVariant`, `getWarrantyViewVariant`.
- **Area visibility:** `src/lib/portalAreas.ts::isAreaVisible` (checks `allowed_areas` override → role default).
- **View-as seller mode:** `src/lib/activeMode.ts` + `viewAsUser.ts` (`useEffectivePortalUser`). Only `timan_backend` can switch.
- **Dealer scoping:** `current_user_dealer_number()` SQL helper + `appUser.dealer_number` client-side, used in RLS for service_machines / service_registrations.

### 1.7 i18n
- **Type:** `Language = 'da' | 'en' | 'de' | 'it' | 'hu'` from `src/types/configurator.ts`.
- **Storage:** `src/context/LanguageContext.tsx` (selected language + `applyPreferredLanguage`). Big translation table in `src/data/translations.ts`; many pages use small inline `T: Record<string, Record<Language, string>>` maps.
- **Adding labels:** prefer inline `T` map per page/component (current pattern in PortalAreaPage and sidebar layouts).

### 1.8 Uploads / Storage
- **Supabase Storage usage:** none found in `src/` or `supabase/functions/`.
- **No buckets used.** Claims/warranty/TSB currently don't upload to Supabase; attachment UI on Service Maintenance is disabled ("kommer snart").

### 1.9 Activity log / history
- **Existing tables:** `audit_log` (phase20/21, JSONB), `portal_activity_log` (phase7, page views), `crm_activities` (phase4).
- **Reusable for machine timeline?** `audit_log` is generic enough for back-end actions; `crm_activities` is dealer/lead scoped. Best long-term: introduce a dedicated `machine_activity` table (additive) rather than overloading existing ones.

### 1.10 Mail/notifications
- **Pattern:** `supabase/functions/send-quote/index.ts` (Resend-style email via edge function); webhook URLs in `src/lib/webhookUrls.ts` (n8n). No notification pipeline for claims/warranty/TSB currently. Out of scope for this initiative — inspection only.

---

## 2. Recommended data model (proposal, not executed)

Center everything on `serial_number` (string, normalized uppercase, no spaces). Optional FK to a future `machines` master:

```text
machines (master, optional)
  serial_number PK
  machine_type, model, dealer_number, customer_*, seller_initials,
  first_delivered_at, current_owner, status

machine_owner_history
  id, serial_number → machines, owner_name, dealer_number, from_date, to_date

machine_activity (timeline)
  id, serial_number, event_type (service|claim|warranty|tsb|comment|upload|owner_change),
  ref_table, ref_id, summary, created_by, created_at, visibility (internal|external)

service_tickets
  id, serial_number, machine_type, dealer_number, customer_*,
  reported_by, reported_at, status (open|in_progress|waiting|resolved|converted_to_claim),
  priority, title, description, assigned_to, converted_claim_id

service_ticket_comments
  id, ticket_id, body, visibility (internal|external), created_by, created_at

machine_documents
  id, serial_number, bucket, path, mime, label, uploaded_by, uploaded_at
```

**Existing tables to backfill `serial_number` linkage** (additive columns only, no schema break):
- `service_claims` → already has it; ensure normalized.
- `warranty_registrations` (future table) → add when migrating store to Supabase.
- `tsb_cases` (future table) → add `machine_serial` (nullable, since some TSBs are model-wide).

Storage buckets to add (later phase):
- `machine-uploads` (private, dealer-scoped via RLS).

---

## 3. Phased implementation plan

### Phase 1 — Add cards + empty routes for "Service tickets" and "Søg på maskine" (FRONTEND ONLY)
- Files changed:
  - `src/lib/portalAreas.ts` (add two placeholders)
  - `src/pages/PortalAreaPage.tsx` (map keys → routes/icons/descriptions)
  - `src/App.tsx` (add 2 routes)
  - `src/pages/service/ServiceTicketsPage.tsx` *(new — placeholder "kommer snart")*
  - `src/pages/service/MachineSearchPage.tsx` *(new — placeholder)*
  - `src/lib/portalAccess.ts` (add `service_tickets`, `machine_search` module keys + defaults)
- SQL: **no**.
- Risk: very low (additive cards + empty pages).
- Tests: cards visible per role, routes load, translations render in DK/GB/DE/IT/HU.

### Phase 2 — Additive SQL/datamodel proposal (write migration file only; do not run)
- Files: `docs/sql/phase44_machine_lifecycle.sql` (machines, machine_activity, service_tickets, service_ticket_comments, machine_documents, machine_owner_history) + RLS mirroring service_registrations pattern + GRANTS.
- SQL: **yes**, but kept as proposal file the user runs manually.
- Risk: none until applied.
- Tests: SQL lint, dry-run review with user.

### Phase 3 — Service tickets list / create / detail
- Files: `src/lib/serviceTicketsService.ts`, `src/pages/service/ServiceTickets{List,New,Detail}Page.tsx`, `src/components/service/ServiceTicketsSidebarLayout.tsx`.
- Tables used: `service_tickets`, `service_ticket_comments`.
- SQL: depends on Phase 2 being applied.
- Risk: medium — first new write path; isolated from existing modules.
- Tests: create ticket, list filter by dealer/serial/status, dealer scoping, view-as mode, i18n.

### Phase 4 — Machine search + machine profile shell
- Files: `MachineSearchPage.tsx`, `MachineProfilePage.tsx`, `src/lib/machineProfileService.ts`, route `/portal/service/machines/:serial`.
- Tables: read-only across `service_machines`, `service_registrations`, `service_claims` (+ later TSB/warranty).
- SQL: maybe a view `v_machine_profile_summary` (optional, additive).
- Risk: low (read-only aggregator).
- Tests: search by serial/customer/dealer, profile shows tabs (history, claims, warranties, TSBs, documents, comments, owners), role-scoped data.

### Phase 5 — Connect claims / warranty / TSB / service registrations
- Files: tiny adapter functions returning items by `serial_number`; UI tabs in MachineProfilePage.
- SQL: maybe add `serial_number` columns to warranty/TSB once those move to Supabase (future); none required now if they remain local stores.
- Risk: low for read; medium when warranty/TSB tables get created.
- Tests: each tab pulls the right records; backend sees all, dealer sees scoped only.

### Phase 6 — Activity log + internal/external comments
- Files: `machineActivityService.ts`, comment composer component, badge "internal" vs "external".
- Tables: `machine_activity`, `service_ticket_comments` (already in P2).
- SQL: triggers on service_tickets/service_registrations/service_claims to insert into `machine_activity` (additive).
- Risk: medium — triggers; guarded by `if exists`.
- Tests: timeline shows events from each source; internal comments hidden from dealer roles.

### Phase 7 — Uploads (Supabase Storage)
- Files: bucket bootstrap doc, `src/lib/machineUploads.ts`, upload component reused in tickets + profile.
- Tables: `machine_documents`.
- SQL: bucket creation + RLS (`docs/sql/phase45_storage_machine_uploads.sql`).
- Risk: medium — first Storage usage in project.
- Tests: upload/list/delete scoped per dealer; backend full access; size/type validation.

### Phase 8 — Conversion ticket → claim
- Files: action on `ServiceTicketDetailPage`, helper in `serviceTicketsService.ts`, link back from claim detail.
- Tables: writes `service_claims`, updates `service_tickets.status='converted_to_claim'` + `converted_claim_id`.
- SQL: no (uses existing tables).
- Risk: medium — touches Claims write path (must not change existing create flow; only adds a new entry point).
- Tests: conversion creates valid claim, ticket flips status, audit entry in `machine_activity`, idempotent.

---

## 4. Risks
- TSB and Warranty are not yet in Supabase; cross-linking will require migrating them later (out of scope until you decide).
- Storage policies are net-new for this project — needs careful RLS.
- Triggers in Phase 6 must be additive and not fire on legacy rows in bulk.
- View-as-seller mode must not leak machines across scopes — needs explicit test.

## 5. Suggested first safe coding step
**Phase 1 only:** add the two cards + empty routes + module-access keys. Pure UI, zero DB, fully reversible. Lets you validate placement, role gating, translations and back-nav before any data model work.

## 6. Open questions before implementation
1. Should "Service tickets" be visible to dealer roles from day one, or internal-only at first?
2. Should `serial_number` be the strict primary identifier, or do you also want a Timan-internal `machine_id` (UUID) for cases where serial is missing/duplicated?
3. For TSB and Warranty: keep local stores for now, or plan a parallel migration to Supabase as part of Phase 5?
4. Should "Søg på maskine" be a separate top-level card, or live as a search bar inside the machine profile area?
5. Upload size cap and allowed mime types for `machine-uploads`?
