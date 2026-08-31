-- Partner admin seller identity guard.
-- Uses dealer_accounts.assigned_seller_id as the canonical Timan seller
-- relation while preserving legacy initials/name/email display fields.

alter table public.dealer_accounts
  add column if not exists assigned_seller_id uuid references public.app_users(id) on delete set null;

create index if not exists dealer_accounts_assigned_seller_id_idx
  on public.dealer_accounts (assigned_seller_id)
  where assigned_seller_id is not null;

with seller_candidates as (
  select
    da.id as dealer_account_id,
    array_agg(au.id order by au.email) filter (where au.id is not null) as seller_ids,
    array_agg(lower(au.email) order by au.email) filter (where au.id is not null) as seller_emails,
    array_agg(au.initials order by au.email) filter (where au.id is not null) as seller_initials,
    array_agg(coalesce(nullif(au.full_name, ''), nullif(au.display_name, ''), au.email) order by au.email) filter (where au.id is not null) as seller_names,
    count(au.id) as seller_count
  from public.dealer_accounts da
  left join public.app_users au
    on coalesce(au.is_active, false) = true
   and coalesce(au.approved, false) = true
   and au.portal_role in ('timan_backend'::public.portal_role, 'timan_seller'::public.portal_role, 'timan_service'::public.portal_role)
   and (
      (coalesce(da.assigned_seller_email, '') <> '' and lower(trim(au.email)) = lower(trim(da.assigned_seller_email)))
      or (
        coalesce(da.assigned_seller_email, '') = ''
        and coalesce(da.assigned_seller_initials, '') <> ''
        and upper(trim(au.initials)) = upper(trim(da.assigned_seller_initials))
      )
   )
  where da.assigned_seller_id is null
    and (
      coalesce(da.assigned_seller_email, '') <> ''
      or coalesce(da.assigned_seller_initials, '') <> ''
    )
  group by da.id
),
safe_matches as (
  select
    dealer_account_id,
    seller_ids[1] as seller_id,
    seller_emails[1] as seller_email,
    seller_initials[1] as seller_initials,
    seller_names[1] as seller_name
  from seller_candidates
  where seller_count = 1
)
update public.dealer_accounts da
set
  assigned_seller_id = safe.seller_id,
  assigned_seller_email = coalesce(nullif(da.assigned_seller_email, ''), safe.seller_email),
  assigned_seller_initials = coalesce(nullif(da.assigned_seller_initials, ''), safe.seller_initials),
  assigned_seller_name = coalesce(nullif(da.assigned_seller_name, ''), safe.seller_name)
from safe_matches safe
where da.id = safe.dealer_account_id;

drop policy if exists dealer_accounts_write on public.dealer_accounts;

create or replace function public.can_manage_partner_admin_fields(
  p_assigned_seller_id uuid,
  p_assigned_seller_email text,
  p_assigned_seller_initials text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where coalesce(au.is_active, false) = true
      and coalesce(au.approved, false) = true
      and (
        au.portal_role in ('timan_backend'::public.portal_role, 'timan_service'::public.portal_role)
        or (
          au.portal_role = 'timan_seller'::public.portal_role
          and (
            au.id = p_assigned_seller_id
            or (
              coalesce(p_assigned_seller_email, '') <> ''
              and lower(trim(au.email)) = lower(trim(p_assigned_seller_email))
            )
            or (
              coalesce(p_assigned_seller_initials, '') <> ''
              and upper(trim(au.initials)) = upper(trim(p_assigned_seller_initials))
            )
          )
        )
      )
      and (
        au.auth_user_id = auth.uid()
        or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
  );
$$;

revoke all on function public.can_manage_partner_admin_fields(uuid, text, text) from public, anon;
grant execute on function public.can_manage_partner_admin_fields(uuid, text, text) to authenticated, service_role;

drop policy if exists dealer_accounts_insert_timan_staff on public.dealer_accounts;
create policy dealer_accounts_insert_timan_staff
on public.dealer_accounts
for insert
to authenticated
with check (public.is_timan_backend());

drop policy if exists dealer_accounts_update_timan_staff on public.dealer_accounts;
create policy dealer_accounts_update_timan_staff
on public.dealer_accounts
for update
to authenticated
using (public.can_manage_partner_admin_fields(assigned_seller_id, assigned_seller_email, assigned_seller_initials))
with check (public.can_manage_partner_admin_fields(assigned_seller_id, assigned_seller_email, assigned_seller_initials));

drop policy if exists dealer_accounts_delete_timan_backend on public.dealer_accounts;
create policy dealer_accounts_delete_timan_backend
on public.dealer_accounts
for delete
to authenticated
using (public.is_timan_backend());

create or replace function public.prevent_external_partner_admin_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.can_manage_partner_admin_fields(old.assigned_seller_id, old.assigned_seller_email, old.assigned_seller_initials) then
    return new;
  end if;

  if new.assigned_seller_id is distinct from old.assigned_seller_id
    or new.assigned_seller_initials is distinct from old.assigned_seller_initials
    or new.assigned_seller_name is distinct from old.assigned_seller_name
    or new.assigned_seller_email is distinct from old.assigned_seller_email
    or new.dealer_type is distinct from old.dealer_type
    or new.customer_type is distinct from old.customer_type
    or new.customer_type_label is distinct from old.customer_type_label
    or new.account_number is distinct from old.account_number
    or new.parent_account_number is distinct from old.parent_account_number
    or new.is_main_account is distinct from old.is_main_account
    or new.is_blocked is distinct from old.is_blocked
    or new.blocked_at is distinct from old.blocked_at
    or new.blocked_by is distinct from old.blocked_by
    or new.is_deleted is distinct from old.is_deleted
    or new.deleted_at is distinct from old.deleted_at
    or new.deleted_by is distinct from old.deleted_by
    or new.status is distinct from old.status
    or new.successor_dealer_id is distinct from old.successor_dealer_id
    or new.successor_dealer_account_number is distinct from old.successor_dealer_account_number
    or new.closed_reason is distinct from old.closed_reason
    or new.closed_at is distinct from old.closed_at
  then
    raise exception 'Kun interne Timan-brugere kan rette administrative partneroplysninger.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_external_partner_admin_update() from public, anon, authenticated;

drop trigger if exists trg_prevent_external_partner_admin_update on public.dealer_accounts;
create trigger trg_prevent_external_partner_admin_update
before update on public.dealer_accounts
for each row
execute function public.prevent_external_partner_admin_update();
