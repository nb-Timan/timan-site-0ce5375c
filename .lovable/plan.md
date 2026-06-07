
# Min Maskine — Unified machine journal (read-only v1)

## Goal

Make the serial number the single source of truth across Warranty, Service registreringer, Service tickets, Claims and TSB. Build a unified journal page that aggregates everything for one serial, while leaving each existing module fully intact.

## Scope of v1 (read-only)

- Combined machine search (cross-source by serial)
- Deep-link route `/portal/service/machines/:serialNumber`
- Unified "Min Maskine" page: header, quick stats, timeline, comments (read-only), related-record cards, documents/photos sections, current owner/dealer
- Direct links to the original detail pages (warranty / service reg / ticket / claim / TSB) — no data duplication
- No schema migrations, no removal of existing modules, no new write paths

Out of scope (deferred):
- Cross-module "machine-level comment" writes (kept read-only — would need a new `machine_comments` table)
- Full owner history workflow (show current owner only; TODO comment in code)
- Document upload/photo upload (sections rendered with empty state if no data)

## Data sources & matching

| Source | Table / store | Serial field |
| --- | --- | --- |
| Machines | `public.machines` (Supabase) | `serial_number` |
| Warranty registrations | `public.warranty_registrations` | `machine_serial_number` |
| Service registrations | `public.service_maintenance_*` | `serial_number` |
| Service tickets | `public.service_tickets` | `serial_number` / `machine_id` |
| Machine activity log | `public.machine_activity_log` | `serial_number` |
| Machine documents | `public.machine_documents` | `serial_number` / `machine_id` |
| Claims | `claims-store.ts` (mock) | `serialNo` |
| TSB | `tsb-store.ts` (mock) | `dealers[].machineSerials[]` |

Serial normalization (`normalizeSerial`): `trim().toUpperCase()` with collapsed internal whitespace. Original display value preserved on every record. Matching is always done against the normalized form; the displayed serial keeps the casing of the first source that returned it (preference order: machines → warranty → service reg → ticket → claim → tsb).

A machine becomes searchable as soon as **any** of these sources yields its serial — the `machines` table is not required.

## Permissions

All Supabase reads continue to go through RLS — dealer-side users only see rows for their own dealer. No new write paths means no new RLS to author.

In the cross-source aggregator we filter the in-memory claims/TSB lists by `dealer_account_id` (or seller dealer scope) for non-internal users using `derivePortalRole(effectivePortalUser)`. Internal users see everything.

Search results, related-record counts and timeline events are all built from already-permission-filtered source data, so dealer scoping is enforced at the data layer, not in the UI.

## Files

### New

- `src/lib/machineJournalService.ts` — `normalizeSerial`, `searchMachinesByIdentifier(query, scope)`, `loadMachineJournal(serial, scope)` returning `{ summary, timeline, comments, related, documents, photos, owners }`. Aggregates Supabase + claims-store + tsb-store; applies dealer scope.
- `src/pages/service/MachineJournalPage.tsx` — the "Min Maskine" page rendered at `/portal/service/machines/:serialNumber`. Sections in order: header, quick stats, timeline, related records, comments, documents, photos, owners. Uses `PortalHeader` / `PortalFooter` and existing translation helpers.
- `src/components/machine/MachineTimeline.tsx` — color-coded timeline (warranty=blue, service=green, ticket=amber, claim=red, tsb=purple, comment=slate) with newest-first toggle.
- `src/components/machine/MachineStatsCards.tsx` — compact stat cards (timer, garanti, seneste service, åbne tickets, åbne claims, TSB mangler) hiding empty values.
- `src/components/machine/MachineRelatedRecords.tsx` — card grid linking to original detail pages.

### Edited

- `src/App.tsx` — add `<Route path="/portal/service/machines/:serialNumber" element={<MachineJournalPage />} />`.
- `src/pages/service/MachineSearchPage.tsx` — extend search to also probe warranty + service-maintenance + tickets + claims + tsb via `searchMachinesByIdentifier`; render a small "Resultater" list when more than one source-only match exists; clicking a row navigates to `/portal/service/machines/:serial`. When a single match is found and it has a `machines` row, keep current tabbed view. When the serial only exists in non-machines sources, redirect/link to the new journal page.
- Where serial numbers are displayed in existing tables (warranty / service reg / tickets / claims), wrap them in a `<Link>` to the journal page if the serial is non-empty. Surgical edits only — labels and table layout unchanged.

## Timeline event types

```text
warranty_registered      blue
service_registered       green
service_ticket_created   amber
service_ticket_status    amber
claim_created            red
claim_status_changed     red
tsb_assigned             purple
tsb_completed            purple
comment_added            slate
```

All events normalized to `{ kind, color, date, title, description?, href? }` where `href` deep-links to the originating record.

## Localization

Page strings added under the existing `T` map (DK/GB/DE/IT/HU/SE/FR/PL/CZ) consistent with the prior i18n work. Product data (machine type, model, customer name, serials, prices) is never translated.

## Testing

1. Serial only in warranties: appears in search → journal page opens → warranty event in timeline + warranty in related records.
2. Serial only in service tickets: search returns it → ticket appears in related + timeline.
3. Serial only in claims (mock): search returns it → claim card + red claim event.
4. Serial in multiple modules: one journal page combines events; counts match per-source totals; each "Åbn …" link opens its original detail page.
5. Dealer user logged in: only own serials returned by search; foreign claim/TSB entries filtered out before render.
6. Internal user: full cross-dealer view.
7. Build passes (`tsc --noEmit`).

## Return at the end

- list of files changed
- new route registered
- data sources included
- serial normalization rule
- how permissions stay enforced
- read-only boundaries of v1
- manual test steps
