-- One internal CRM competitor master. Historical free-text snapshots remain intact.
create table public.crm_competitors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  website_url text check (website_url is null or website_url ~* '^https?://[^[:space:]]+$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index crm_competitors_name_unique on public.crm_competitors (lower(btrim(name)));
create table public.crm_competitor_machine_groups (
  competitor_id uuid not null references public.crm_competitors(id) on delete cascade,
  machine_group text not null check (machine_group in (
    'RC-751', 'RC-1000s', 'Timan 3330', 'Timan 2620',
    'Loader-Line and CS-200 Traktor', 'Løse redskaber / attachments', 'Options/accessories/other'
  )),
  primary key (competitor_id, machine_group)
);
alter table public.crm_competitors enable row level security;
alter table public.crm_competitor_machine_groups enable row level security;
revoke all on public.crm_competitors, public.crm_competitor_machine_groups from public, anon;
grant select, insert, update on public.crm_competitors to authenticated;
grant select, insert, delete on public.crm_competitor_machine_groups to authenticated;

create policy crm_competitors_internal_read on public.crm_competitors for select to authenticated
using (exists (select 1 from public.app_users au where au.auth_user_id = (select auth.uid())
  and au.portal_role in ('timan_backend', 'timan_seller', 'timan_service')));
create policy crm_competitors_backend_insert on public.crm_competitors for insert to authenticated
with check (exists (select 1 from public.app_users au where au.auth_user_id = (select auth.uid())
  and au.portal_role = 'timan_backend'));
create policy crm_competitors_backend_update on public.crm_competitors for update to authenticated
using (exists (select 1 from public.app_users au where au.auth_user_id = (select auth.uid())
  and au.portal_role = 'timan_backend'))
with check (exists (select 1 from public.app_users au where au.auth_user_id = (select auth.uid())
  and au.portal_role = 'timan_backend'));
create policy crm_competitor_groups_internal_read on public.crm_competitor_machine_groups for select to authenticated
using (exists (select 1 from public.app_users au where au.auth_user_id = (select auth.uid())
  and au.portal_role in ('timan_backend', 'timan_seller', 'timan_service')));
create policy crm_competitor_groups_backend_insert on public.crm_competitor_machine_groups for insert to authenticated
with check (exists (select 1 from public.app_users au where au.auth_user_id = (select auth.uid())
  and au.portal_role = 'timan_backend'));
create policy crm_competitor_groups_backend_delete on public.crm_competitor_machine_groups for delete to authenticated
using (exists (select 1 from public.app_users au where au.auth_user_id = (select auth.uid())
  and au.portal_role = 'timan_backend'));

create function public.save_crm_competitor(
  p_id uuid, p_name text, p_country_code text, p_website_url text,
  p_active boolean, p_machine_groups text[]
)
returns public.crm_competitors language plpgsql security invoker set search_path = public as $$
declare saved public.crm_competitors%rowtype;
begin
  if nullif(btrim(p_name), '') is null then
    raise exception using errcode = '23514', message = 'COMPETITOR_NAME_REQUIRED';
  end if;
  if exists (select 1 from unnest(coalesce(p_machine_groups, array[]::text[])) g
    where g not in ('RC-751', 'RC-1000s', 'Timan 3330', 'Timan 2620',
      'Loader-Line and CS-200 Traktor', 'Løse redskaber / attachments', 'Options/accessories/other')) then
    raise exception using errcode = '23514', message = 'INVALID_MACHINE_GROUP';
  end if;
  if p_id is null then
    insert into public.crm_competitors (name, country_code, website_url, active)
    values (btrim(p_name), nullif(p_country_code, ''), nullif(p_website_url, ''), p_active)
    returning * into saved;
  else
    update public.crm_competitors set name = btrim(p_name),
      country_code = nullif(p_country_code, ''), website_url = nullif(p_website_url, ''),
      active = p_active, updated_at = now()
    where id = p_id returning * into saved;
    if not found then raise exception using errcode = '42501', message = 'COMPETITOR_OUTSIDE_SCOPE'; end if;
  end if;
  delete from public.crm_competitor_machine_groups where competitor_id = saved.id;
  insert into public.crm_competitor_machine_groups (competitor_id, machine_group)
  select saved.id, g from unnest(coalesce(p_machine_groups, array[]::text[])) g group by g;
  return saved;
end;
$$;
revoke all on function public.save_crm_competitor(uuid,text,text,text,boolean,text[]) from public, anon;
grant execute on function public.save_crm_competitor(uuid,text,text,text,boolean,text[]) to authenticated;

insert into public.crm_competitors (name) values
  ('Egholm'), ('Hako'), ('Kärcher'), ('Vitra'), ('Fort'), ('AS Motor'),
  ('Energreen'), ('X-Rot'), ('Husqvarna')
on conflict do nothing;

alter table public.crm_demo_leads add column competitor_id uuid references public.crm_competitors(id) on delete set null;
alter table public.crm_leads add column lost_competitor_id uuid references public.crm_competitors(id) on delete set null;
create index crm_demo_leads_competitor_id_idx on public.crm_demo_leads (competitor_id) where competitor_id is not null;
create index crm_leads_lost_competitor_id_idx on public.crm_leads (lost_competitor_id) where lost_competitor_id is not null;

-- Exact normalized names only. 'Andre' and uncertain historical spellings stay as raw text.
update public.crm_demo_leads d set competitor_id = c.id
from public.crm_competitors c
where d.competitor_id is null and lower(btrim(d.competitor_name)) = lower(btrim(c.name));
update public.crm_leads l set lost_competitor_id = c.id
from public.crm_competitors c
where l.lost_competitor_id is null and lower(btrim(l.lost_competitor)) = lower(btrim(c.name));

create or replace function public.save_crm_demo_result(
  p_demo_id uuid, p_result jsonb, p_effective_user_id uuid default null
)
returns public.crm_demo_leads language plpgsql security invoker set search_path = public as $$
declare
  actor public.app_users%rowtype := public.crm_demo_effective_actor(p_effective_user_id);
  demo public.crm_demo_leads%rowtype;
  lead_row public.crm_leads%rowtype;
  interest integer := nullif(p_result->>'interest_level', '')::integer;
  competitors text := nullif(p_result->>'competitors_present', '');
  chosen_competitor uuid := nullif(p_result->>'competitor_id', '')::uuid;
  chosen_name text;
  inline_only boolean := coalesce((p_result->>'inline_only')::boolean, false);
begin
  select * into demo from public.crm_demo_leads where id = p_demo_id for update;
  if not found then raise exception using errcode = '42501', message = 'DEMO_OUTSIDE_SCOPE'; end if;
  select * into lead_row from public.crm_leads where id = demo.source_lead_id for update;
  if not found or (coalesce(actor.portal_role::text, actor.role) = 'timan_seller'
    and lead_row.owner_user_id is distinct from actor.id) then
    raise exception using errcode = '42501', message = 'DEMO_LEAD_OUTSIDE_SCOPE';
  end if;
  if not inline_only and (demo.demo_date is null or demo.demo_date > (now() at time zone 'Europe/Copenhagen')::date) then
    raise exception using errcode = '23514', message = 'DEMO_NOT_YET_HELD';
  end if;
  if (interest is not null and interest not between 1 and 5)
     or (not inline_only and interest is null)
     or (competitors is not null and competitors not in ('yes', 'no'))
     or (competitors is distinct from 'yes' and chosen_competitor is not null) then
    raise exception using errcode = '23514', message = 'DEMO_RESULT_INVALID';
  end if;
  if chosen_competitor is not null then
    select name into chosen_name from public.crm_competitors
    where id = chosen_competitor and (active or id = demo.competitor_id);
    if not found then raise exception using errcode = '23514', message = 'COMPETITOR_NOT_ACTIVE'; end if;
  end if;
  update public.crm_demo_leads set
    interest_level = interest, competitors_present = competitors,
    competitor_id = chosen_competitor,
    competitor_name = chosen_name,
    completed_at = case when inline_only then completed_at else coalesce(completed_at, now()) end,
    completed_by = case when inline_only then completed_by else coalesce(completed_by, actor.id) end
  where id = p_demo_id returning * into demo;
  if not inline_only then
    update public.crm_leads set demo_has_run = 'yes', demo_registration_pending = false where id = lead_row.id;
  end if;
  return demo;
end;
$$;
revoke all on function public.save_crm_demo_result(uuid,jsonb,uuid) from public, anon;
grant execute on function public.save_crm_demo_result(uuid,jsonb,uuid) to authenticated;

create or replace view analytics_export.crm_competitors as
select id as competitor_id, name as competitor_name, country_code as competitor_country_code,
  website_url as competitor_website_url, active as competitor_active
from public.crm_competitors;
create or replace view analytics_export.crm_competitor_machine_groups as
select competitor_id, machine_group from public.crm_competitor_machine_groups;
create or replace view analytics_export.crm_lost_deals as
select l.id as lead_id, l.lead_no as lead_number, l.lost_competitor_id as competitor_id,
  c.name as competitor_name, l.lost_competitor as legacy_competitor_text,
  l.lost_reason, l.owner_user_id as seller_id, l.machine_types
from public.crm_leads l left join public.crm_competitors c on c.id = l.lost_competitor_id
where l.lost_competitor_id is not null or l.lost_competitor is not null;

-- Replace only the existing controlled Demo view, retaining every old column.
create or replace view analytics_export.crm_demo_leads as
select demo.id as demo_id, demo.demo_no as demo_number, demo.source_lead_id,
  lead.id as lead_id, lead.lead_no as lead_number, lead.lead_reference_type,
  demo.result_status as demo_status, demo.demo_date, demo.owner_user_id as seller_id,
  demo.owner_name as seller_name, demo.owner_email as seller_email, demo.dealer_account_id,
  demo.dealer_company, demo.dealer_country, demo.customer_name, demo.demo_machine as machine,
  demo.completed_at, (demo.completed_at is not null) as is_completed,
  demo.interest_level as customer_interest, demo.competitors_present as competitor_present,
  demo.competitor_id, c.name as competitor_name, demo.competitor_name as legacy_competitor_text
from public.crm_demo_leads demo
left join public.crm_leads lead on lead.id = demo.source_lead_id
left join public.crm_competitors c on c.id = demo.competitor_id;

revoke all on analytics_export.crm_competitors, analytics_export.crm_competitor_machine_groups,
  analytics_export.crm_lost_deals, analytics_export.crm_demo_leads from public, anon, authenticated;
grant select on analytics_export.crm_competitors, analytics_export.crm_competitor_machine_groups,
  analytics_export.crm_lost_deals, analytics_export.crm_demo_leads to service_role;
do $grants$ begin
  if exists (select 1 from pg_roles where rolname = 'fabric_reader') then
    execute 'grant select on analytics_export.crm_competitors, analytics_export.crm_competitor_machine_groups, analytics_export.crm_lost_deals, analytics_export.crm_demo_leads to fabric_reader';
  end if;
end $grants$;
