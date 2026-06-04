## Mål

Timan Backend og Timan Service skal kunne se præcis hvad en fremtidig SharePoint Warranty sync vil gøre, **før** rigtig sync aktiveres. Alt er read-only. Ingen `warranty_registrations`-writes, ingen automatisk dealer-oprettelse, ingen hard delete, ingen RLS- eller datamodel-ændringer i denne fase.

## Hvad bygges

### 1. Edge Function: `sharepoint-warranty-verify` (ny, read-only)

Henter SharePoint-listen `Warranty registration` på `sites/SalgMarketingTiman` via Graph (samme secrets som dealer-sync). Returnerer:

- Liste fundet: `displayName`, `name`, `id`, række-antal
- Præcise interne feltnavne (column metadata fra `/columns`)
- Forventede mapping-felter til `warranty_registrations` (fra Phase 57)
- Manglende obligatoriske felter (pr. række: tomt serienummer, manglende dato, manglende forhandlernavn osv.)
- Ukendte SharePoint-felter (felter som ikke findes i mapping-udkastet)
- Warnings-array

Ingen writes. Ingen kald til `warranty_registrations`. Adgang: `timan_backend` eller `timan_service`.

### 2. Edge Function: `sharepoint-warranty-dryrun` (ny, read-only)

Henter alle rækker fra SharePoint, mapper dem in-memory mod den planlagte `warranty_registrations`-struktur og kører dealer matching mod eksisterende `dealer_accounts` + `dealer_account_aliases` (kun `select`). Returnerer:

- `fetched`: antal SharePoint-rækker
- `new`: rækker uden eksisterende `sharepoint_item_id` i `warranty_registrations`
- `updates`: rækker hvor mapped data adskiller sig fra eksisterende række (mapped-only sammenligning — INGEN write)
- `unchanged`: rækker som matcher 1:1
- Dealer matching-bucket:
  - `safe_matches`: exact match på normaliseret `dealer_name_raw` mod `dealer_accounts.company_name` ELLER eksisterende række i `dealer_account_aliases.normalized_alias`
  - `needs_review`: fuzzy/normaliserede forslag (trim, lowercase, strip A/S, ApS, &, mellemrum → 1+ kandidater med score)
  - `unmatched`: ingen kandidat fundet → vises som unmatched (ingen dealer oprettes)
- Warnings-array

Read-only. Skriver intet — hverken `warranty_registrations`, `dealer_account_aliases` eller `dealer_accounts`. Adgang: `timan_backend` eller `timan_service`.

### 3. UI-panel i Teknik & Service → Garantiregistrering

Nyt panel `WarrantySharePointSyncPanel` placeret øverst på `/portal/teknik-service/garantiregistrering` (eller warranty admin-sektionen — bekræftes ved implementering ud fra eksisterende route).

Synlighed: kun `portal_role === "timan_backend" || portal_role === "timan_service"`. Skjult for alle andre roller (sælger, dealer, importør, service partner).

Layout følger samme mønster som `SharePointSyncPanel` (dealer-sync):

- Header med titel "SharePoint synkronisering — garantiregistreringer" + read-only banner
- To rækker:
  1. **Verificér SharePoint** → kalder verify-edge-function → modal med liste-info, feltnavne, tæller, manglende felter, ukendte felter, warnings
  2. **Dry-run** → kalder dryrun-edge-function → modal med fetched/new/updates/unchanged + matching-buckets (safe / needs_review / unmatched) + warnings
- **Ikke** en "Synkroniser med SharePoint"-knap. Pladsholder-tekst nederst: *"Rigtig sync aktiveres i en senere fase."*

### 4. Genbrug af eksisterende warranty probe

Den eksisterende `sharepoint-warranty-probe` (raw probe-knap på dealer-accounts siden) bevares uændret som backend-only debug-værktøj.

## Hvad bygges IKKE i denne fase

- Ingen `Synkroniser med SharePoint`-knap.
- Ingen edge function der skriver til `warranty_registrations`.
- Ingen oprettelse af `dealer_accounts` fra SharePoint.
- Ingen skrivning til `dealer_account_aliases` (forslag vises kun).
- Ingen ændringer i `warranty_registrations`-tabellen, RLS, triggers eller policies.
- Ingen `sharepoint_sync_logs`-rækker (ingen log nødvendig nu).
- Ingen hard delete af noget.

## Tekniske detaljer

### Dealer matching-algoritme (server-side, in-memory)

```text
normalize(name):
  lower → trim → fjern "a/s","aps","ivs","&"
  collapse whitespace
  strip diakritiske tegn

for hver SharePoint-række r:
  raw = r["Forhandlernavn"]
  n   = normalize(raw)

  // 1. exact match
  da = dealer_accounts where normalize(company_name) = n
  if da: safe_matches.push({raw, dealer_id: da.id, reason: "exact"})

  // 2. alias match
  alias = dealer_account_aliases where normalized_alias = n
  if alias: safe_matches.push({raw, dealer_id: alias.dealer_account_id, reason: "alias"})

  // 3. fuzzy (Levenshtein eller token-overlap >= 0.8)
  candidates = top 3 dealer_accounts sorteret efter score
  if candidates[0].score >= 0.8: needs_review.push({raw, candidates})
  else: unmatched.push({raw})
```

Algoritmen er ren server-side, kører på et snapshot. Skriver intet.

### Edge function auth-mønster

Identisk med `sharepoint-warranty-probe`: `Bearer` JWT → `getClaims` → opslag i `app_users` på email → kræv `portal_role in ('timan_backend','timan_service')` og `is_active && approved`.

### Filer der ændres / oprettes

```text
supabase/functions/sharepoint-warranty-verify/index.ts        (ny)
supabase/functions/sharepoint-warranty-dryrun/index.ts        (ny)
src/components/warranty/WarrantySharePointSyncPanel.tsx       (ny)
src/components/warranty/WarrantyVerifyModal.tsx               (ny)
src/components/warranty/WarrantyDryRunModal.tsx               (ny)
src/components/warranty/WarrantyAdminSidebarLayout.tsx        (eller WarrantyDashboardBody) — mount panelet for backend/service
```

Eksakt mount-punkt verificeres ved første læsning af eksisterende warranty-admin-route.

## Næste fase (ikke i scope nu)

Når Backend + Service har bekræftet at dry-run viser det rigtige, bygges fase 2:
- "Godkend alias"-UI så `needs_review`-matches kan oprettes som `dealer_account_aliases`
- Rigtig sync-knap som upserter til `warranty_registrations` (kun `safe_matches` + matched aliases)
- `sharepoint_sync_logs`-skrivning
- Soft-delete-håndtering via `is_active_in_source`
