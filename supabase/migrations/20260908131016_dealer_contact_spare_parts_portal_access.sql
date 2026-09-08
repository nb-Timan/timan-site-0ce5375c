-- Individual reservedelsportal access is stored on the canonical dealer
-- contact. The flag can be prepared before a portal identity exists, but the
-- access RPC only grants entry when the active app user matches that contact.

alter table public.dealer_contacts
  add column if not exists spare_parts_portal_access boolean not null default false;

create index if not exists dealer_contacts_spare_parts_portal_access_idx
  on public.dealer_contacts (dealer_account_id, lower(trim(email)))
  where spare_parts_portal_access = true and email is not null;

create or replace function public.can_manage_dealer_contact_portal_access(p_dealer_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_accounts da
    where da.id = p_dealer_account_id
      and public.can_manage_partner_admin_fields(
        da.assigned_seller_id,
        da.assigned_seller_email,
        da.assigned_seller_initials
      )
  );
$$;

create or replace function public.guard_dealer_contact_spare_parts_portal_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.spare_parts_portal_access
      and not public.can_manage_dealer_contact_portal_access(new.dealer_account_id) then
      raise exception 'Only authorized Timan staff may grant reservedelsportal access'
        using errcode = '42501';
    end if;
  elsif new.spare_parts_portal_access is distinct from old.spare_parts_portal_access
    and not public.can_manage_dealer_contact_portal_access(old.dealer_account_id) then
    raise exception 'Only authorized Timan staff may change reservedelsportal access'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists dealer_contacts_guard_spare_parts_portal_access on public.dealer_contacts;
create trigger dealer_contacts_guard_spare_parts_portal_access
before insert or update on public.dealer_contacts
for each row execute function public.guard_dealer_contact_spare_parts_portal_access();

create or replace function public.can_access_spare_parts_portal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.current_timan_app_user() actor
    join public.dealer_accounts da
      on da.account_number = actor.dealer_number
    join public.dealer_contacts dc
      on dc.dealer_account_id = da.id
     and dc.spare_parts_portal_access = true
     and dc.email is not null
     and lower(trim(dc.email)) = lower(trim(actor.email))
  );
$$;

revoke all on function public.can_manage_dealer_contact_portal_access(uuid) from public, anon;
revoke all on function public.guard_dealer_contact_spare_parts_portal_access() from public, anon;
revoke all on function public.can_access_spare_parts_portal() from public, anon;
grant execute on function public.can_manage_dealer_contact_portal_access(uuid) to authenticated, service_role;
grant execute on function public.can_access_spare_parts_portal() to authenticated, service_role;
