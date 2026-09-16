-- A Messe portal session must not be able to bypass the country policy by
-- removing trade_fair from a forged client payload. Normal CRM leads remain
-- outside this guard unless they explicitly carry the Messe marker.

create or replace function public.enforce_messe_lead_country_seller_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_country text := lower(trim(coalesce(new.country, '')));
  seller_initials text;
  seller_role text;
  is_messe_actor boolean := false;
begin
  select exists (
    select 1
    from public.app_users actor
    where actor.auth_user_id = (select auth.uid())
      and actor.is_active = true
      and actor.approved = true
      and lower(actor.status) in ('active', 'approved')
      and (
        lower(coalesce(actor.portal_variant, '')) = 'messe'
        or actor.portal_role::text = 'exhibition_user'
      )
  ) into is_messe_actor;

  if not is_messe_actor
    and lower(trim(coalesce(new.trade_fair, ''))) not in ('messe / exhibition', 'messe / udstilling') then
    return new;
  end if;

  select upper(trim(seller.initials)), seller.portal_role::text
  into seller_initials, seller_role
  from public.app_users seller
  where seller.id = new.owner_user_id
    and seller.is_active = true
    and seller.approved = true
    and lower(seller.status) in ('active', 'approved');

  if seller_initials is null or seller_role not in ('timan_seller', 'timan_backend') then
    raise exception 'Messe lead requires an active assignable Timan seller.'
      using errcode = '23514';
  end if;

  if selected_country in ('germany', 'deutschland', 'tyskland', 'de')
    and seller_initials not in ('AKR', 'JTN') then
    raise exception 'Messe leads for Germany require seller AKR or JTN.'
      using errcode = '23514';
  end if;

  if selected_country in ('denmark', 'danmark', 'dk')
    and seller_initials <> 'EM' then
    raise exception 'Messe leads for Denmark require seller EM.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_messe_lead_country_seller_eligibility() from public, anon, authenticated;
