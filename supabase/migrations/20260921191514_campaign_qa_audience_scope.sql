alter table public.marketing_campaigns
  add column audience text not null default 'public'
  check (audience in ('public', 'qa')),
  add column qa_user_id uuid references auth.users(id) on delete cascade,
  add constraint marketing_campaigns_audience_owner check (
    (audience = 'public' and qa_user_id is null)
    or (audience = 'qa' and qa_user_id is not null)
  );

create index marketing_campaigns_qa_user_idx
  on public.marketing_campaigns (qa_user_id)
  where audience = 'qa';

create or replace function public.prepare_marketing_campaign()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_prefix text;
  v_sequence integer;
begin
  if new.campaign_code is null or btrim(new.campaign_code) = '' then
    v_prefix := 'K' || to_char(new.starts_at at time zone 'Europe/Copenhagen', 'MM-YYYY-');
    perform pg_advisory_xact_lock(hashtext('marketing-campaign-code-' || v_prefix));
    select coalesce(max((regexp_match(campaign_code, '^' || v_prefix || '([0-9]{2})$'))[1]::integer), 0) + 1
      into v_sequence
      from public.marketing_campaigns
      where campaign_code like v_prefix || '%';
    new.campaign_code := v_prefix || lpad(v_sequence::text, 2, '0');
  else
    new.campaign_code := upper(btrim(new.campaign_code));
  end if;
  new.campaign_name := btrim(new.campaign_name);
  if new.campaign_name = '' then raise exception using errcode = '23514', message = 'Campaign name is required'; end if;
  if new.audience = 'qa' then new.qa_user_id := auth.uid(); else new.qa_user_id := null; end if;
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  if new.status <> 'published' then new.published_at := null; end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop policy if exists marketing_campaigns_read_active_anon on public.marketing_campaigns;
drop policy if exists marketing_campaigns_read_authenticated on public.marketing_campaigns;
drop policy if exists marketing_campaigns_manage_insert on public.marketing_campaigns;
drop policy if exists marketing_campaigns_manage_update on public.marketing_campaigns;
drop policy if exists marketing_campaigns_manage_delete on public.marketing_campaigns;

create policy marketing_campaigns_read_active_anon
on public.marketing_campaigns for select
to anon
using (
  audience = 'public'
  and status = 'published'
  and published_at is not null and published_at <= now()
  and starts_at <= now() and ends_at > now()
);

create policy marketing_campaigns_read_authenticated
on public.marketing_campaigns for select
to authenticated
using (
  (
    audience = 'public'
    and (
      (
        status = 'published'
        and published_at is not null and published_at <= now()
        and starts_at <= now() and ends_at > now()
      )
      or (select public.can_manage_marketing_configurator_content())
    )
  )
  or (audience = 'qa' and qa_user_id = (select auth.uid()))
);

create policy marketing_campaigns_manage_insert
on public.marketing_campaigns for insert
to authenticated
with check (
  (select public.can_manage_marketing_configurator_content())
  and (audience = 'public' or qa_user_id = (select auth.uid()))
);

create policy marketing_campaigns_manage_update
on public.marketing_campaigns for update
to authenticated
using (
  (select public.can_manage_marketing_configurator_content())
  and (audience = 'public' or qa_user_id = (select auth.uid()))
)
with check (
  (select public.can_manage_marketing_configurator_content())
  and (audience = 'public' or qa_user_id = (select auth.uid()))
);

create policy marketing_campaigns_manage_delete
on public.marketing_campaigns for delete
to authenticated
using (
  (select public.can_manage_marketing_configurator_content())
  and (audience = 'public' or qa_user_id = (select auth.uid()))
);

drop policy if exists marketing_campaign_products_read_active_anon on public.marketing_campaign_products;
drop policy if exists marketing_campaign_products_read_authenticated on public.marketing_campaign_products;
drop policy if exists marketing_campaign_products_manage_insert on public.marketing_campaign_products;
drop policy if exists marketing_campaign_products_manage_update on public.marketing_campaign_products;
drop policy if exists marketing_campaign_products_manage_delete on public.marketing_campaign_products;

create policy marketing_campaign_products_read_active_anon
on public.marketing_campaign_products for select
to anon
using (exists (
  select 1 from public.marketing_campaigns campaign
  where campaign.id = campaign_id
    and campaign.audience = 'public'
    and campaign.status = 'published'
    and campaign.published_at is not null and campaign.published_at <= now()
    and campaign.starts_at <= now() and campaign.ends_at > now()
));

create policy marketing_campaign_products_read_authenticated
on public.marketing_campaign_products for select
to authenticated
using (exists (
  select 1 from public.marketing_campaigns campaign
  where campaign.id = campaign_id
    and (
      (
        campaign.audience = 'public'
        and (
          (
            campaign.status = 'published'
            and campaign.published_at is not null and campaign.published_at <= now()
            and campaign.starts_at <= now() and campaign.ends_at > now()
          )
          or (select public.can_manage_marketing_configurator_content())
        )
      )
      or (campaign.audience = 'qa' and campaign.qa_user_id = (select auth.uid()))
    )
));

create policy marketing_campaign_products_manage_insert
on public.marketing_campaign_products for insert
to authenticated
with check (
  (select public.can_manage_marketing_configurator_content())
  and exists (
    select 1 from public.marketing_campaigns campaign
    where campaign.id = campaign_id
      and (campaign.audience = 'public' or campaign.qa_user_id = (select auth.uid()))
  )
);

create policy marketing_campaign_products_manage_update
on public.marketing_campaign_products for update
to authenticated
using (
  (select public.can_manage_marketing_configurator_content())
  and exists (
    select 1 from public.marketing_campaigns campaign
    where campaign.id = campaign_id
      and (campaign.audience = 'public' or campaign.qa_user_id = (select auth.uid()))
  )
)
with check (
  (select public.can_manage_marketing_configurator_content())
  and exists (
    select 1 from public.marketing_campaigns campaign
    where campaign.id = campaign_id
      and (campaign.audience = 'public' or campaign.qa_user_id = (select auth.uid()))
  )
);

create policy marketing_campaign_products_manage_delete
on public.marketing_campaign_products for delete
to authenticated
using (
  (select public.can_manage_marketing_configurator_content())
  and exists (
    select 1 from public.marketing_campaigns campaign
    where campaign.id = campaign_id
      and (campaign.audience = 'public' or campaign.qa_user_id = (select auth.uid()))
  )
);

create or replace function public.save_marketing_campaign(p_campaign jsonb, p_products jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := nullif(p_campaign ->> 'id', '')::uuid;
begin
  if not (select public.can_manage_marketing_configurator_content()) then
    raise exception using errcode = '42501', message = 'Campaign administration is not permitted';
  end if;
  if jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products) = 0 then
    raise exception using errcode = '23514', message = 'At least one campaign product is required';
  end if;

  if v_id is null then
    insert into public.marketing_campaigns (
      campaign_code, campaign_name, status, campaign_type, benefit_pricing_type,
      discount_pct, target_price_dkk, target_price_eur, trigger_min_quantity,
      trigger_match_mode, benefit_quantity, scale_benefit_with_trigger, audience,
      starts_at, ends_at, created_by, updated_by
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

comment on column public.marketing_campaigns.audience is
  'public campaigns are portal-visible; qa campaigns are visible only to their authenticated owner.';
