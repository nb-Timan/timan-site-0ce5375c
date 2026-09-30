-- Canonical campaign eligibility by commercial partner account type.
-- The NOT NULL default backfills every existing campaign to all supported
-- partner types, preserving its pre-migration reach.

alter table public.marketing_campaigns
  add column eligible_partner_types text[] not null
  default array['dealer', 'importer', 'service_partner']::text[],
  add constraint marketing_campaigns_eligible_partner_types_valid check (
    cardinality(eligible_partner_types) > 0
    and eligible_partner_types <@ array['dealer', 'importer', 'service_partner']::text[]
  );

comment on column public.marketing_campaigns.eligible_partner_types is
  'Canonical dealer_accounts partner types eligible for the campaign. Existing campaigns default to all supported types.';

create or replace function public.save_marketing_campaign(p_campaign jsonb, p_products jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := nullif(p_campaign ->> 'id', '')::uuid;
  v_eligible_partner_types text[];
begin
  if not (select public.can_manage_marketing_configurator_content()) then
    raise exception using errcode = '42501', message = 'Campaign administration is not permitted';
  end if;
  if jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products) = 0 then
    raise exception using errcode = '23514', message = 'At least one campaign product is required';
  end if;
  if p_campaign ? 'eligible_partner_types'
     and jsonb_typeof(p_campaign -> 'eligible_partner_types') <> 'array' then
    raise exception using errcode = '23514', message = 'Campaign partner audience must be an array';
  end if;

  select coalesce(array_agg(distinct value order by value), '{}'::text[])
    into v_eligible_partner_types
    from jsonb_array_elements_text(
      coalesce(
        p_campaign -> 'eligible_partner_types',
        '["dealer", "importer", "service_partner"]'::jsonb
      )
    ) as values(value);

  if cardinality(v_eligible_partner_types) = 0
     or not (v_eligible_partner_types <@ array['dealer', 'importer', 'service_partner']::text[]) then
    raise exception using errcode = '23514', message = 'At least one valid campaign partner type is required';
  end if;

  if v_id is null then
    insert into public.marketing_campaigns (
      campaign_code, campaign_name, status, campaign_type, benefit_pricing_type,
      discount_pct, target_price_dkk, target_price_eur, trigger_min_quantity,
      trigger_match_mode, benefit_quantity, scale_benefit_with_trigger, audience,
      eligible_partner_types, starts_at, ends_at, created_by, updated_by
    ) values (
      nullif(p_campaign ->> 'campaign_code', ''), p_campaign ->> 'campaign_name',
      coalesce(p_campaign ->> 'status', 'draft'), coalesce(p_campaign ->> 'campaign_type', 'badge'),
      nullif(p_campaign ->> 'benefit_pricing_type', ''), nullif(p_campaign ->> 'discount_pct', '')::numeric,
      nullif(p_campaign ->> 'target_price_dkk', '')::numeric, nullif(p_campaign ->> 'target_price_eur', '')::numeric,
      coalesce(nullif(p_campaign ->> 'trigger_min_quantity', '')::integer, 1),
      coalesce(nullif(p_campaign ->> 'trigger_match_mode', ''), 'any'),
      coalesce(nullif(p_campaign ->> 'benefit_quantity', '')::integer, 1),
      coalesce((p_campaign ->> 'scale_benefit_with_trigger')::boolean, false),
      coalesce(nullif(p_campaign ->> 'audience', ''), 'public'),
      v_eligible_partner_types,
      (p_campaign ->> 'starts_at')::timestamptz, (p_campaign ->> 'ends_at')::timestamptz,
      auth.uid(), auth.uid()
    ) returning id into v_id;
  else
    update public.marketing_campaigns set
      campaign_code = nullif(p_campaign ->> 'campaign_code', ''),
      campaign_name = p_campaign ->> 'campaign_name', status = coalesce(p_campaign ->> 'status', status),
      campaign_type = coalesce(p_campaign ->> 'campaign_type', campaign_type),
      benefit_pricing_type = nullif(p_campaign ->> 'benefit_pricing_type', ''),
      discount_pct = nullif(p_campaign ->> 'discount_pct', '')::numeric,
      target_price_dkk = nullif(p_campaign ->> 'target_price_dkk', '')::numeric,
      target_price_eur = nullif(p_campaign ->> 'target_price_eur', '')::numeric,
      trigger_min_quantity = coalesce(nullif(p_campaign ->> 'trigger_min_quantity', '')::integer, 1),
      trigger_match_mode = coalesce(nullif(p_campaign ->> 'trigger_match_mode', ''), 'any'),
      benefit_quantity = coalesce(nullif(p_campaign ->> 'benefit_quantity', '')::integer, 1),
      scale_benefit_with_trigger = coalesce((p_campaign ->> 'scale_benefit_with_trigger')::boolean, false),
      audience = coalesce(nullif(p_campaign ->> 'audience', ''), 'public'),
      eligible_partner_types = v_eligible_partner_types,
      starts_at = (p_campaign ->> 'starts_at')::timestamptz,
      ends_at = (p_campaign ->> 'ends_at')::timestamptz
    where id = v_id;
    if not found then raise exception using errcode = 'P0002', message = 'Campaign not found'; end if;
    delete from public.marketing_campaign_products where campaign_id = v_id;
  end if;

  insert into public.marketing_campaign_products (
    campaign_id, product_key, machine_key, item_number, product_role, quantity,
    discount_pct, target_price_dkk, target_price_eur
  )
  select v_id, product_key, machine_key, item_number, product_role,
    greatest(coalesce(quantity, 1), 1), discount_pct, target_price_dkk, target_price_eur
  from jsonb_to_recordset(p_products) as product(
    product_key text, machine_key text, item_number text, product_role text,
    quantity integer, discount_pct numeric, target_price_dkk numeric, target_price_eur numeric
  );
  return v_id;
end;
$$;

revoke all on function public.save_marketing_campaign(jsonb, jsonb) from public, anon;
grant execute on function public.save_marketing_campaign(jsonb, jsonb) to authenticated;
