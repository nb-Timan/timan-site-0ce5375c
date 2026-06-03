# SharePoint vs portal — ansvarsdeling

**Princip**

- **SharePoint** er master for *firmaoplysninger* (stamdata).
- **Portalen** er master for *adgang, status og relationer*.

## Felter SharePoint-sync MÅ skrive

Whitelist i `supabase/functions/sharepoint-sync-dealers/index.ts`
(`MASTERDATA_PATCH_FIELDS`):

- `company_name`
- `dealer_type`
- `country`
- `address_line_1`
- `address_line_2`
- `zip_city_raw`
- `postal_code`
- `city`
- `source_customer_type_code`
- `source_modified_at`
- `last_synced_at`

For *nye* SharePoint-rækker indsættes desuden tabel-default
`is_active = true`, `is_blocked = false`. Eksisterende rækker
re-insertes ALDRIG, så portal-flags kan ikke nulstilles ved sync.

## Felter SharePoint-sync ALDRIG må overskrive

- `is_active`, `is_blocked`, `blocked_at`, `blocked_by`
- `is_deleted`, `deleted_at`, `deleted_by`
- `assigned_seller_initials`, `assigned_seller_name`, `assigned_seller_email`
- `latitude`, `longitude`, `geocoded_at`, `geocoding_status`, `geocoding_error`
- Linkede brugere, CRM-data, tilbud, ordrer, noter, budgetter (separate tabeller).

## Manuel test/check

1. Backend → Forhandlere → vælg en forhandler → klik **Spær**.
   Verificér at rækken vises som *Spærret* i Backend og CRM.
2. Backend → SharePoint synkronisering → klik **Dry-run**.
   Verificér i resultatet at den spærrede forhandler IKKE optræder
   som "opdateres" pga. is_blocked (whitelist'en sammenligner kun
   masterdata-felter).
3. Klik **Synkroniser nu**.
4. Genåbn forhandleren i Backend og CRM:
   - `is_blocked` skal stadig være `true`
   - Statusbadge skal stadig vise *Spærret*
   - `assigned_seller_*` skal være uændret
   - Linkede brugere skal stadig være knyttet til forhandleren

## SQL-kontrol

```sql
-- Liste over spærrede forhandlere før/efter sync:
select account_number, company_name, is_blocked, blocked_at, blocked_by,
       assigned_seller_initials, last_synced_at
  from public.dealer_accounts
 where is_blocked = true
 order by company_name;
```

`last_synced_at` må gerne opdateres, men `is_blocked`, `blocked_at`,
`blocked_by`, `assigned_seller_*` skal være uændrede mellem to sync-kørsler.
