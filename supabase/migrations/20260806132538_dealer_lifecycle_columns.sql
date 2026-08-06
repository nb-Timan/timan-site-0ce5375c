-- Dealer lifecycle flags used by backend, CRM and geocoding.
-- Additive only: existing dealers default to active/not deleted.

alter table public.dealer_accounts
  add column if not exists is_blocked boolean not null default false,
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_by text,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text;

create index if not exists dealer_accounts_is_blocked_idx
  on public.dealer_accounts (is_blocked)
  where is_blocked = true;

create index if not exists dealer_accounts_is_deleted_idx
  on public.dealer_accounts (is_deleted)
  where is_deleted = true;
