-- A Partnerdata exception never overwrites the approved-contract payment term.
alter table public.dealer_accounts
  add column if not exists payment_terms_override text;

comment on column public.dealer_accounts.payment_terms_override is
  'Optional Partnerdata override. When null, the active contract payment term remains canonical.';

create or replace function public.can_manage_partner_payment_terms(
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
    select 1 from public.app_users au
    where coalesce(au.is_active, false) = true and coalesce(au.approved, false) = true
      and (
        au.portal_role = 'timan_backend'::public.portal_role
        or (au.portal_role = 'timan_seller'::public.portal_role and (
          au.id = p_assigned_seller_id
          or (coalesce(p_assigned_seller_email, '') <> '' and lower(trim(au.email)) = lower(trim(p_assigned_seller_email)))
          or (coalesce(p_assigned_seller_initials, '') <> '' and upper(trim(au.initials)) = upper(trim(p_assigned_seller_initials)))
        ))
      )
      and (au.auth_user_id = auth.uid() or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', ''))))
  );
$$;

revoke all on function public.can_manage_partner_payment_terms(uuid, text, text) from public, anon;
grant execute on function public.can_manage_partner_payment_terms(uuid, text, text) to authenticated, service_role;

create or replace function public.guard_partner_financial_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.payment_terms_override is distinct from old.payment_terms_override
    or new.currency_code is distinct from old.currency_code
  ) and not public.can_manage_partner_payment_terms(
    old.assigned_seller_id, old.assigned_seller_email, old.assigned_seller_initials
  ) then
    raise exception 'Only Timan Backend or the assigned Timan seller may change financial terms';
  end if;
  return new;
end;
$$;

drop trigger if exists dealer_accounts_guard_financial_terms on public.dealer_accounts;
create trigger dealer_accounts_guard_financial_terms
before update of payment_terms_override, currency_code on public.dealer_accounts
for each row execute function public.guard_partner_financial_terms();
