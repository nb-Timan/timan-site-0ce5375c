## Mål

Backend-forsiden bliver et tydeligt kontrolcenter med fem navngivne grupper i stedet for en flad gitter af kort. En ny side `Data & Integrationer` samler alle import/eksport/sync-værktøjer under faner med ensartet "Verificér / Dry-run / Kør sync / Historik"-mønster.

Ingen route fjernes — alle eksisterende sider beholder deres URL. Ingen DB-, permission- eller funktionsændringer.

---

## 1) Backend forsiden — grupperet layout

Erstat det flade `placeholders`-grid i `PortalAreaPage` (kun for `areaId === 'timan_backend'`) med fem sektioner. Hver sektion = overskrift + grid af `PlaceholderCard`'er. Eksisterende kort genbruges; nye links (Data & Integrationer, Systemstatus, Mail Log, Job Queue, Partnerkort, Geografisk dækning) pegerer på eksisterende sider hvor de findes, ellers et "kommer snart"-kort (disabled visning, ingen route tilføjes).

Grupper:

1. **Brugerstyring** — Brugere, Roller, Modul-adgang, Audit Log
2. **Partnerstyring** — Forhandlere, Dealer Matching, Partnerkort administration, Geografisk dækning
3. **Data & Integrationer** — ét stort kort der linker til den nye `/portal/backend/data` side
4. **Analyse & Budget** — Portal Analytics, Budget Import, Budget Dashboard
5. **System** — Mail Log, Job Queue, Systemstatus, Persistence Audit

Implementering: en ny lokal komponent `BackendHomeGrouped` i `PortalAreaPage.tsx` (eller separat fil `src/components/portal/BackendHome.tsx` for renlighed). Sektionerne er statiske; visibility-checks bibeholdes for hvert kort baseret på `derivePortalRole` / `hasModuleAccess` præcis som i dag.

## 2) Ny side: `/portal/backend/data` — Data & Integrationer

Ny fil `src/pages/backend/BackendDataIntegrationsPage.tsx` + route i `src/App.tsx`. Adgang: kun `timan_backend` (samme guard-mønster som de øvrige Backend-sider).

Faner via shadcn `Tabs`:

- **Forhandlere** — Dealer SharePoint sync (genbrug `SharePointSyncPanel`), Geocoding (genbrug `GeocodeDealersPanel`), Import firma-/kontaktinformation (genbrug `DealerProfileImportPanel`), Eksport forhandlerdata (knap → CSV-eksport via eksisterende `dealerAccountsService` — eller "kommer snart" hvis ikke trivielt).
- **Garantiregistreringer** — Warranty SharePoint sync (`WarrantySharePointSyncPanel`), Dealer matching (`WarrantyDealerLinkBackfillPanel`), Eksport warranty registrations (CSV-knap eller "kommer snart").
- **Prislister** — link til `/portal/backend/price-lists` (Import / Eksport / Prisvalidering henvises hertil).
- **Budget** — link til `/portal/backend/budget-import` + Budget Dashboard (CRM-link).
- **Brugere** — Eksport brugere / Eksport rettigheder (CSV via eksisterende `backendUsersService` eller "kommer snart").
- **Sync Historik** — samlet liste over `sharepoint_sync_logs` (forhandlere), warranty sync (afledes af samme tabel hvis muligt, ellers "kommer snart"), Geocoding logs, Import logs. Viser senest kørt + status-badge.

## 3) Ensartet "sync-mønster"

Hver sync-sektion i Data & Integrationer pakkes i en wrapper-komponent `SyncSection` med fire knap-pladser: Verificér, Dry-run, Kør sync, Historik. De eksisterende paneler eksponerer allerede disse handlinger (knapperne forbliver internt i panelet); wrapperen tilføjer en sektionsoverskrift + "Senest kørt: ÅÅÅÅ-MM-DD HH:MM" + farvet status-badge (grøn/gul/rød) ud fra seneste log-række.

## 4) Status-badges + "Senest kørt"

Ny lille util `src/lib/syncStatusBadge.ts`:
- input: seneste log-række (success-flag + timestamp + warnings count)
- output: `{ tone: 'green'|'yellow'|'red', label, lastRunAt }`

Brug `sharepoint_sync_logs` / `warranty_sync_logs` (hvis findes — verificeres ved implementering) til at hente "senest kørt" via en lille hook `useLatestSyncLog(kind)`.

## 5) Ingen brud på det eksisterende

- Alle nuværende routes (`/portal/backend/users`, `…/dealer-accounts`, `…/budget-import` osv.) består uændret.
- Eksisterende dashboards der i dag huser `SharePointSyncPanel` / `WarrantySharePointSyncPanel` rører jeg ikke — panelerne genbruges, ikke flyttes.
- Permissions: `BackendDataIntegrationsPage` bruger nøjagtigt samme rolle-guard som `BackendUsersPage`.
- Ingen tabeller, RPC'er eller edge functions ændres.

---

## Teknisk filoversigt

```text
NEW   src/pages/backend/BackendDataIntegrationsPage.tsx
NEW   src/components/backend/SyncSection.tsx
NEW   src/lib/syncStatusBadge.ts
EDIT  src/pages/PortalAreaPage.tsx        (gruppér placeholders når areaId='timan_backend')
EDIT  src/App.tsx                         (route '/portal/backend/data')
EDIT  src/lib/portalAreas.ts              (tilføj nye placeholder-keys: data_integrations,
                                           dealer_matching, partner_cards, geo_coverage,
                                           mail_log, job_queue, system_status, budget_dashboard)
```

## Hvad jeg IKKE bygger i denne omgang

- Faktiske eksport-CSV-handlers for forhandlere/warranty/budget/brugere hvis de ikke allerede findes — disse vises som "Kommer snart"-knap så UI'et er færdigt og næste opgave kan implementere dem.
- Nye sider for Mail Log, Job Queue, Systemstatus, Dealer Matching standalone, Partnerkort administration, Geografisk dækning — kun kort med "kommer snart" badge til de manglende.

Vil du have at jeg går videre med denne plan?
