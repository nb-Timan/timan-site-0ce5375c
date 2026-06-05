# Dealer succession (efterfølger-forhandler)

Mål: bevar historik på lukkede/spærrede forhandlere (fx AP Motorcenter), men kobl fremtidig service/warranty/CRM-ansvar til en aktiv efterfølger (fx Reesink). Ingen sletning, ingen automatisk historikflytning, ingen ændring af SharePoint-sync for dealer-stamdata.

## 1. Database (additiv migration)

Ny migration `db/sql/20260605_dealer_successor.sql` — udelukkende `ALTER TABLE ADD COLUMN IF NOT EXISTS`:

- `successor_dealer_id uuid references public.dealer_accounts(id) on delete set null`
- `successor_dealer_account_number text`
- `closed_reason text`
- `closed_at timestamptz`
- Index på `successor_dealer_id`
- Selv-reference guard: trigger / check der forhindrer at en forhandler er sin egen successor, og simpel kæde-guard (A→B men ikke B→A).

Ingen drop, ingen RLS-ændring, ingen data-flytning. Eksisterende `is_blocked` / `is_deleted` bevares som status-kilde.

Statusafledning (i UI/service-laget, ikke ny kolonne):
- `is_deleted = true` → "Lukket"
- `is_blocked = true` → "Spærret"
- ellers → "Aktiv"

## 2. Service-lag

`src/lib/dealerAccountsService.ts`:
- Udvid `DealerAccount` typen med de 4 nye felter + afledt `status: 'active' | 'blocked' | 'closed'`.
- Ny funktion `setDealerSuccessor(dealerId, successorId, reason, adminEmail)` der opdaterer succession-felterne + sætter `closed_at` hvis ikke sat.
- Ny funktion `clearDealerSuccessor(dealerId)`.
- Ny hjælper `resolveActiveDealer(dealerId)` der følger successor-kæden (max 5 hop) og returnerer den aktive ansvarlige.
- Filter-helper til partnere: `listDealers({ status: 'active' | 'inactive' | 'all' })`.

## 3. Backend → Forhandlere (detail/rediger)

`src/pages/backend/BackendDealerAccountsPage.tsx` (detail-panelet, omkring linje 877–1019):
- Vis status-badge: Aktiv / Spærret / Lukket.
- Hvis spærret eller lukket: nyt panel "Efterfølger-forhandler":
  - Søg/vælg blandt aktive `dealer_accounts` (combobox med firmanavn + kontonummer).
  - Felt: lukkeårsag (textarea).
  - Knap: Gem efterfølger / Fjern efterfølger.
  - Vis nuværende efterfølger med link til dens detail-side.
- På listen: lille pil-badge "→ Reesink" ved rækker der har successor.

## 4. Warranty dealer matching

`src/components/warranty/WarrantySharePointSyncPanel.tsx` + `sharepoint-warranty-dryrun`:
- Når foreslået dealer match peger på en forhandler med `is_blocked` eller `is_deleted`:
  - Vis tydelig rød/amber markering: "Lukket forhandler — historik bevares".
  - Hvis dealeren har successor: vis "Foreslået aktiv ansvarlig: {successor.company_name}".
  - "Godkend match" knap kobler aliaset til successor (ikke til den lukkede), men `dealer_name_snapshot` bevares uændret fra SharePoint.
  - Hvis ingen successor: kun manuel godkendelse mod den lukkede forhandler er mulig — med advarsel.
- Ingen automatisk historikflytning af eksisterende `warranty_registrations`.

## 5. Partnerkort

`src/pages/misc/PartnerMapPage.tsx`:
- Default: vis kun forhandlere hvor `is_blocked = false AND is_deleted = false`.
- Tilføj filter-control (segment): "Aktive" | "Spærrede/Lukkede" | "Alle".
- Pins for spærrede/lukkede vises kun når filteret tillader det, med afdæmpet farve.

## 6. CRM og Service visning

`src/pages/crm/CrmDealerDetailPage.tsx` (og service-ticket-detail):
- Historiske data forbliver knyttet til oprindelig dealer.
- Hvis dealer har successor: header-banner "Efterfølger: {company_name}" med link.
- Service-flow der opretter nye sager: når oprindelig dealer er lukket og har successor, foreslå at oprette på successor (manuel bekræftelse, ikke automatisk omdirigering).

## 7. SharePoint dealer-sync

`supabase/functions/sharepoint-sync-dealers/index.ts`:
- Ingen funktionsændring nu — kun en eksplicit allow-list over kolonner der må overskrives (firma-stamdata).
- Tilføj kommentar + kode-guard: `successor_dealer_id`, `successor_dealer_account_number`, `closed_reason`, `closed_at`, `is_blocked`, `is_deleted` må aldrig indgå i upsert-payload fra SharePoint.

## 8. Tests / verifikation

- Manuel: sæt AP Motorcenter til spærret + successor = Reesink, kør warranty dry-run, bekræft at forslag peger på Reesink men `dealer_name_snapshot` stadig er "AP Motorcenter".
- Partnerkort: bekræft AP Motorcenter forsvinder fra default-visning.
- CRM: åbn AP Motorcenter detail, bekræft banner med link til Reesink, historik intakt.

## Tekniske detaljer

ASCII af relation:

```text
dealer_accounts (AP Motorcenter)
  is_blocked = true
  closed_at  = 2026-06-05
  closed_reason = "Overtaget af Reesink"
  successor_dealer_id ────────────┐
                                  ▼
                       dealer_accounts (Reesink)
                         is_blocked = false
```

Ingen ændringer i denne PR:
- Ingen migration af eksisterende rækker (warranty/service/ordre/CRM).
- Ingen hard delete nogen steder.
- Ingen ændring af `dealer_account_aliases` schema (kun ny opslagslogik der respekterer successor).
- Ingen warranty real-sync trigges.
