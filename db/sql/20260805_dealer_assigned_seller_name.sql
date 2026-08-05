-- Portal-owned seller assignment label for dealer accounts.
-- SharePoint sync intentionally does not overwrite seller assignment fields.
alter table public.dealer_accounts
  add column if not exists assigned_seller_name text;

comment on column public.dealer_accounts.assigned_seller_name
  is 'Portal-owned display name for the assigned Timan seller. Not overwritten by SharePoint sync.';

notify pgrst, 'reload schema';
