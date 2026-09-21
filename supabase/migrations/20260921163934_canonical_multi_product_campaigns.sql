-- Canonical multi-product campaigns for the Configurator.
-- Existing product-content badges remain untouched and continue to be valid.

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_code text not null unique check (btrim(campaign_code) <> ''),
  campaign_name text not null check (btrim(campaign_name) <> ''),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  campaign_type text not null default 'badge' check (campaign_type in ('badge', 'percentage', 'fixed', 'conditional')),
  benefit_pricing_type text check (benefit_pricing_type in ('percentage', 'fixed')),
  discount_pct numeric(7,4),
  target_price_dkk numeric(14,2),
  target_price_eur numeric(14,2),
  trigger_min_quantity integer not null default 1 check (trigger_min_quantity > 0),
  benefit_quantity integer not null default 1 check (benefit_quantity > 0),
  scale_benefit_with_trigger boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint marketing_campaigns_period check (ends_at > starts_at),
  constraint marketing_campaigns_percentage check (
    campaign_type <> 'percentage' or (discount_pct > 0 and discount_pct <= 100)
  ),
  constraint marketing_campaigns_fixed check (
    campaign_type <> 'fixed' or (target_price_dkk >= 0 and target_price_eur >= 0)
  ),
  constraint marketing_campaigns_conditional_rule check (
    campaign_type <> 'conditional'
    or (benefit_pricing_type = 'percentage' and discount_pct > 0 and discount_pct <= 100)
    or (benefit_pricing_type = 'fixed' and target_price_dkk >= 0 and target_price_eur >= 0)
  )
);

create table public.marketing_campaign_products (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  product_key text not null check (btrim(product_key) <> ''),
  machine_key text not null check (btrim(machine_key) <> ''),
  item_number text not null check (btrim(item_number) <> ''),
  product_role text not null check (product_role in ('linked', 'trigger', 'benefit')),
  quantity integer not null default 1 check (quantity > 0),
  discount_pct numeric(7,4),
  target_price_dkk numeric(14,2),
  target_price_eur numeric(14,2),
  created_at timestamptz not null default now(),
  constraint marketing_campaign_products_unique_role unique (campaign_id, product_key, product_role),
  constraint marketing_campaign_products_pct check (discount_pct is null or (discount_pct > 0 and discount_pct <= 100)),
  constraint marketing_campaign_products_dkk check (target_price_dkk is null or target_price_dkk >= 0),
  constraint marketing_campaign_products_eur check (target_price_eur is null or target_price_eur >= 0)
);

create index marketing_campaigns_active_idx
  on public.marketing_campaigns (status, starts_at, ends_at);
create index marketing_campaign_products_campaign_idx
  on public.marketing_campaign_products (campaign_id, product_role);
create index marketing_campaign_products_product_idx
  on public.marketing_campaign_products (product_key, product_role);

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
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  if new.status <> 'published' then new.published_at := null; end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger marketing_campaigns_prepare
before insert or update on public.marketing_campaigns
for each row execute function public.prepare_marketing_campaign();

alter table public.marketing_campaigns enable row level security;
alter table public.marketing_campaign_products enable row level security;

create policy marketing_campaigns_read_active
on public.marketing_campaigns for select
to anon, authenticated
using (status = 'published' and published_at is not null and published_at <= now() and starts_at <= now() and ends_at > now());

create policy marketing_campaigns_manage_select
on public.marketing_campaigns for select
to authenticated
using ((select public.can_manage_marketing_configurator_content()));
create policy marketing_campaigns_manage_insert
on public.marketing_campaigns for insert
to authenticated
with check ((select public.can_manage_marketing_configurator_content()));
create policy marketing_campaigns_manage_update
on public.marketing_campaigns for update
to authenticated
using ((select public.can_manage_marketing_configurator_content()))
with check ((select public.can_manage_marketing_configurator_content()));
create policy marketing_campaigns_manage_delete
on public.marketing_campaigns for delete
to authenticated
using ((select public.can_manage_marketing_configurator_content()));

create policy marketing_campaign_products_read_active
on public.marketing_campaign_products for select
to anon, authenticated
using (exists (
  select 1 from public.marketing_campaigns campaign
  where campaign.id = campaign_id
    and campaign.status = 'published'
    and campaign.published_at is not null and campaign.published_at <= now()
    and campaign.starts_at <= now() and campaign.ends_at > now()
));
create policy marketing_campaign_products_manage_select
on public.marketing_campaign_products for select
to authenticated
using ((select public.can_manage_marketing_configurator_content()));
create policy marketing_campaign_products_manage_insert
on public.marketing_campaign_products for insert
to authenticated
with check ((select public.can_manage_marketing_configurator_content()));
create policy marketing_campaign_products_manage_update
on public.marketing_campaign_products for update
to authenticated
using ((select public.can_manage_marketing_configurator_content()))
with check ((select public.can_manage_marketing_configurator_content()));
create policy marketing_campaign_products_manage_delete
on public.marketing_campaign_products for delete
to authenticated
using ((select public.can_manage_marketing_configurator_content()));

grant select on public.marketing_campaigns, public.marketing_campaign_products to anon;
grant select, insert, update, delete on public.marketing_campaigns, public.marketing_campaign_products to authenticated;

revoke all on function public.prepare_marketing_campaign() from public, anon, authenticated;

create or replace function public.validate_marketing_campaign_relations()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_campaign public.marketing_campaigns%rowtype;
  v_campaign_id uuid;
begin
  if tg_table_name = 'marketing_campaigns' then
    v_campaign_id := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    v_campaign_id := case when tg_op = 'DELETE' then old.campaign_id else new.campaign_id end;
  end if;
  select * into v_campaign from public.marketing_campaigns where id = v_campaign_id;
  if not found or v_campaign.status <> 'published' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if v_campaign.campaign_type = 'conditional' then
    if not exists (select 1 from public.marketing_campaign_products where campaign_id = v_campaign_id and product_role = 'trigger') then
      raise exception using errcode = '23514', message = 'Published conditional campaign requires a trigger product';
    end if;
    if not exists (select 1 from public.marketing_campaign_products where campaign_id = v_campaign_id and product_role = 'benefit') then
      raise exception using errcode = '23514', message = 'Published conditional campaign requires a benefit product';
    end if;
  elsif v_campaign.campaign_type in ('percentage', 'fixed') then
    if not exists (select 1 from public.marketing_campaign_products where campaign_id = v_campaign_id and product_role in ('benefit', 'linked')) then
      raise exception using errcode = '23514', message = 'Published economic campaign requires a linked product';
    end if;
  elsif not exists (select 1 from public.marketing_campaign_products where campaign_id = v_campaign_id) then
    raise exception using errcode = '23514', message = 'Published campaign requires a linked product';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create constraint trigger marketing_campaigns_validate_relations
after insert or update on public.marketing_campaigns
deferrable initially deferred
for each row execute function public.validate_marketing_campaign_relations();
create constraint trigger marketing_campaign_products_validate_relations
after insert or update or delete on public.marketing_campaign_products
deferrable initially deferred
for each row execute function public.validate_marketing_campaign_relations();

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
      benefit_quantity, scale_benefit_with_trigger, starts_at, ends_at, created_by, updated_by
    ) values (
      nullif(p_campaign ->> 'campaign_code', ''), p_campaign ->> 'campaign_name',
      coalesce(p_campaign ->> 'status', 'draft'), coalesce(p_campaign ->> 'campaign_type', 'badge'),
      nullif(p_campaign ->> 'benefit_pricing_type', ''), nullif(p_campaign ->> 'discount_pct', '')::numeric,
      nullif(p_campaign ->> 'target_price_dkk', '')::numeric, nullif(p_campaign ->> 'target_price_eur', '')::numeric,
      coalesce(nullif(p_campaign ->> 'trigger_min_quantity', '')::integer, 1),
      coalesce(nullif(p_campaign ->> 'benefit_quantity', '')::integer, 1),
      coalesce((p_campaign ->> 'scale_benefit_with_trigger')::boolean, false),
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
      benefit_quantity = coalesce(nullif(p_campaign ->> 'benefit_quantity', '')::integer, 1),
      scale_benefit_with_trigger = coalesce((p_campaign ->> 'scale_benefit_with_trigger')::boolean, false),
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

revoke all on function public.validate_marketing_campaign_relations() from public, anon, authenticated;
revoke all on function public.save_marketing_campaign(jsonb, jsonb) from public, anon;
grant execute on function public.save_marketing_campaign(jsonb, jsonb) to authenticated;

comment on table public.marketing_campaigns is 'Canonical Campaign entity. Commercial rules apply only to new/current Configurator calculations.';
comment on table public.marketing_campaign_products is 'Campaign product links. Roles distinguish presentation, trigger and benefit products.';
