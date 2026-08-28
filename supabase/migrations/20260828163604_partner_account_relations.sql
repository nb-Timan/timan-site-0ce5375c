-- Partner network relations.
--
-- This additive model supports many-to-many partner relations without
-- changing existing scope logic based on dealer_accounts.parent_account_number
-- or service_partner_dealer_links.

create table if not exists public.partner_account_relations (
  id uuid primary key default gen_random_uuid(),
  source_account_id uuid not null references public.dealer_accounts(id) on delete cascade,
  target_account_id uuid not null references public.dealer_accounts(id) on delete cascade,
  relation_type text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_account_relations_not_self check (source_account_id <> target_account_id),
  constraint partner_account_relations_type_check check (
    relation_type in (
      'importer_has_dealer',
      'importer_has_service_partner',
      'importer_has_dealer_customer',
      'dealer_has_service_partner',
      'dealer_has_dealer_customer',
      'service_partner_has_dealer_customer',
      'service_partner_has_dealer'
    )
  ),
  constraint partner_account_relations_unique unique (
    source_account_id,
    target_account_id,
    relation_type
  )
);

create index if not exists partner_account_relations_source_idx
  on public.partner_account_relations(source_account_id)
  where active = true;

create index if not exists partner_account_relations_target_idx
  on public.partner_account_relations(target_account_id)
  where active = true;

create index if not exists partner_account_relations_type_idx
  on public.partner_account_relations(relation_type);

create or replace function public.partner_account_kind(account_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when normalized like '%forhandlerkunde%' or normalized like '%dealercustomer%' then 'dealer_customer'
    when normalized like '%servicepartner%' or normalized like '%service_partner%' then 'service_partner'
    when normalized like '%import%' then 'importer'
    when normalized like '%forhandler%' or normalized like '%dealer%' then 'dealer'
    else 'other'
  end
  from (
    select regexp_replace(
      lower(concat_ws('|', customer_type, customer_type_label, dealer_type)),
      '[[:space:]_-]+',
      '',
      'g'
    ) as normalized
    from public.dealer_accounts
    where id = account_id
  ) source_data;
$$;

create or replace function public.validate_partner_account_relation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  source_kind text;
  target_kind text;
begin
  if new.source_account_id = new.target_account_id then
    raise exception 'A partner relation cannot point to the same account';
  end if;

  source_kind := public.partner_account_kind(new.source_account_id);
  target_kind := public.partner_account_kind(new.target_account_id);

  if not (
    (new.relation_type = 'importer_has_dealer' and source_kind = 'importer' and target_kind = 'dealer')
    or (new.relation_type = 'importer_has_service_partner' and source_kind = 'importer' and target_kind = 'service_partner')
    or (new.relation_type = 'importer_has_dealer_customer' and source_kind = 'importer' and target_kind = 'dealer_customer')
    or (new.relation_type = 'dealer_has_service_partner' and source_kind = 'dealer' and target_kind = 'service_partner')
    or (new.relation_type = 'dealer_has_dealer_customer' and source_kind = 'dealer' and target_kind = 'dealer_customer')
    or (new.relation_type = 'service_partner_has_dealer_customer' and source_kind = 'service_partner' and target_kind = 'dealer_customer')
    or (new.relation_type = 'service_partner_has_dealer' and source_kind = 'service_partner' and target_kind = 'dealer')
  ) then
    raise exception 'Invalid partner relation %. Source kind %, target kind %', new.relation_type, source_kind, target_kind;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_partner_account_relation_trigger on public.partner_account_relations;
create trigger validate_partner_account_relation_trigger
before insert or update on public.partner_account_relations
for each row
execute function public.validate_partner_account_relation();

alter table public.partner_account_relations enable row level security;

revoke all on public.partner_account_relations from anon, public;
grant select, insert, update, delete on public.partner_account_relations to authenticated;
grant all on public.partner_account_relations to service_role;

drop policy if exists partner_account_relations_backend_select on public.partner_account_relations;
create policy partner_account_relations_backend_select
on public.partner_account_relations
for select
to authenticated
using (public.is_timan_backend());

drop policy if exists partner_account_relations_backend_insert on public.partner_account_relations;
create policy partner_account_relations_backend_insert
on public.partner_account_relations
for insert
to authenticated
with check (public.is_timan_backend());

drop policy if exists partner_account_relations_backend_update on public.partner_account_relations;
create policy partner_account_relations_backend_update
on public.partner_account_relations
for update
to authenticated
using (public.is_timan_backend())
with check (public.is_timan_backend());

drop policy if exists partner_account_relations_backend_delete on public.partner_account_relations;
create policy partner_account_relations_backend_delete
on public.partner_account_relations
for delete
to authenticated
using (public.is_timan_backend());

-- Backfill read-only compatibility data into the new network table so the
-- overview can show existing relations without changing the old scope model.
insert into public.partner_account_relations (
  source_account_id,
  target_account_id,
  relation_type,
  active
)
select
  parent.id,
  child.id,
  case
    when public.partner_account_kind(child.id) = 'service_partner' then 'importer_has_service_partner'
    when public.partner_account_kind(child.id) = 'dealer_customer' then 'importer_has_dealer_customer'
    else 'importer_has_dealer'
  end,
  true
from public.dealer_accounts child
join public.dealer_accounts parent
  on lower(trim(child.parent_account_number)) = lower(trim(parent.account_number))
where child.parent_account_number is not null
  and public.partner_account_kind(parent.id) = 'importer'
  and public.partner_account_kind(child.id) in ('dealer', 'service_partner', 'dealer_customer')
on conflict (source_account_id, target_account_id, relation_type) do nothing;

do $$
begin
  if to_regclass('public.service_partner_dealer_links') is not null then
    insert into public.partner_account_relations (
      source_account_id,
      target_account_id,
      relation_type,
      active,
      created_at
    )
    select
      service_partner_account_id,
      dealer_account_id,
      'service_partner_has_dealer',
      active,
      created_at
    from public.service_partner_dealer_links
    on conflict (source_account_id, target_account_id, relation_type) do update
    set active = excluded.active,
        updated_at = now();
  end if;
end $$;
