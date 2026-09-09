-- The overview is a single, scoped server-side read. The function is SECURITY
-- INVOKER, so dealer_contracts RLS remains the authority for row visibility.
create or replace function public.list_internal_dealer_contract_overview(
  p_query text default null,
  p_status text default 'all',
  p_partner_type text default null,
  p_seller_id uuid default null
)
returns table (
  contract jsonb,
  partner_name text,
  account_number text,
  partner_type text,
  country text,
  seller_id uuid,
  seller_initials text,
  seller_name text,
  seller_email text
)
language sql
stable
security invoker
set search_path = public
as $$
  with actor as (
    select * from public.current_timan_app_user()
  ), selected_seller as (
    select au.id, au.email, au.initials
    from public.app_users au
    where au.id = p_seller_id
    limit 1
  ), rows as (
    select
      to_jsonb(dc) as contract,
      dc.contract_status,
      dc.contract_number,
      dc.form_data,
      dc.dealer_account_number,
      dc.updated_at,
      coalesce(nullif(da.company_name, ''), nullif(dc.form_data ->> 'dealerName', ''), 'Ukendt partner') as partner_name,
      coalesce(da.account_number, dc.dealer_account_number, '') as account_number,
      coalesce(da.country, '') as country,
      coalesce(dc.form_data ->> 'partnerType', da.customer_type_label, da.customer_type, da.dealer_type, '') as resolved_partner_type,
      coalesce(da.assigned_seller_id, null) as resolved_seller_id,
      coalesce(da.assigned_seller_initials, '') as resolved_seller_initials,
      coalesce(nullif(da.assigned_seller_name, ''), nullif(dc.form_data ->> 'timanSellerName', '')) as resolved_seller_name,
      coalesce(nullif(da.assigned_seller_email, ''), nullif(dc.form_data ->> 'timanSellerEmail', '')) as resolved_seller_email
    from public.dealer_contracts dc
    left join lateral (
      select dealer.*
      from public.dealer_accounts dealer
      where dealer.id = dc.dealer_account_id
         or dealer.account_number = dc.dealer_account_number
      order by (dealer.id = dc.dealer_account_id) desc
      limit 1
    ) da on true
    cross join actor
    left join selected_seller on true
    where actor.portal_role in ('timan_backend', 'timan_seller')
      and (
        actor.portal_role = 'timan_backend'
        or public.can_manage_dealer_contract_access(coalesce(dc.dealer_account_id, da.id))
      )
      and (
        p_seller_id is null
        or (
          actor.portal_role = 'timan_backend'
          and selected_seller.id is not null
          and (
            da.assigned_seller_id = selected_seller.id
            or lower(coalesce(da.assigned_seller_email, '')) = lower(coalesce(selected_seller.email, ''))
            or upper(coalesce(da.assigned_seller_initials, '')) = upper(coalesce(selected_seller.initials, ''))
            or lower(coalesce(dc.form_data ->> 'timanSellerEmail', '')) = lower(coalesce(selected_seller.email, ''))
            or lower(coalesce(dc.guided_review_completed_by_email, '')) = lower(coalesce(selected_seller.email, ''))
            or lower(coalesce(dc.owner_email, '')) = lower(coalesce(selected_seller.email, ''))
          )
        )
      )
  )
  select
    contract,
    partner_name,
    account_number,
    resolved_partner_type,
    country,
    resolved_seller_id,
    nullif(resolved_seller_initials, ''),
    resolved_seller_name,
    resolved_seller_email
  from rows
  where (
    p_status = 'all'
    or (p_status = 'draft' and contract_status in ('draft', 'guided_review'))
    or (p_status = 'pending' and contract_status not in ('draft', 'guided_review', 'approved', 'changes_requested', 'archived'))
    or (p_status = 'approved' and contract_status = 'approved')
    or (p_status = 'rejected' and contract_status = 'changes_requested')
    or (p_status = 'terminated' and contract_status = 'archived')
  )
  and (
    nullif(trim(coalesce(p_partner_type, '')), '') is null
    or lower(resolved_partner_type) = lower(trim(p_partner_type))
  )
  and (
    nullif(trim(coalesce(p_query, '')), '') is null
    or concat_ws(' ',
      partner_name,
      account_number,
      country,
      coalesce(resolved_seller_initials, ''),
      coalesce(resolved_seller_name, ''),
      coalesce(resolved_seller_email, ''),
      coalesce(contract_number, ''),
      coalesce(contract_status, '')
    ) ilike '%' || trim(p_query) || '%'
  )
  order by updated_at desc;
$$;

revoke all on function public.list_internal_dealer_contract_overview(text, text, text, uuid) from public, anon;
grant execute on function public.list_internal_dealer_contract_overview(text, text, text, uuid) to authenticated, service_role;
