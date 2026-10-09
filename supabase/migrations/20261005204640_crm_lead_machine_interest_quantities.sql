create table if not exists public.crm_lead_machine_interests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  interest_type text not null check (interest_type in ('machine', 'equipment')),
  machine_key text not null check (length(trim(machine_key)) > 0),
  item_key text not null check (length(trim(item_key)) > 0),
  item_number text not null check (length(trim(item_number)) > 0),
  quantity integer not null default 1 check (quantity >= 1),
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, interest_type, machine_key, item_key)
);

comment on table public.crm_lead_machine_interests is
  'Canonical per-line quantities for CRM lead machine and equipment interest. crm_leads.machine_types remains the legacy/search projection.';

create index if not exists crm_lead_machine_interests_lead_idx
  on public.crm_lead_machine_interests (lead_id);

create index if not exists crm_lead_machine_interests_machine_idx
  on public.crm_lead_machine_interests (machine_key, interest_type);

alter table public.crm_lead_machine_interests enable row level security;

drop policy if exists crm_lead_machine_interests_select_scoped
  on public.crm_lead_machine_interests;
create policy crm_lead_machine_interests_select_scoped
  on public.crm_lead_machine_interests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.crm_leads lead
      where lead.id = crm_lead_machine_interests.lead_id
    )
  );

revoke all on table public.crm_lead_machine_interests from public, anon;
revoke insert, update, delete on table public.crm_lead_machine_interests from authenticated;
grant select on table public.crm_lead_machine_interests to authenticated;

create or replace function public.replace_crm_lead_machine_interests(
  p_lead_id uuid,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.app_users%rowtype;
  lead_row public.crm_leads%rowtype;
  inserted_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into actor
  from public.app_users candidate
  where coalesce(candidate.approved, false) = true
    and coalesce(candidate.is_active, false) = true
    and (
      candidate.auth_user_id = auth.uid()
      or lower(trim(candidate.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
  order by case when candidate.auth_user_id = auth.uid() then 0 else 1 end
  limit 1;

  if actor.id is null then
    raise exception 'Active portal user required';
  end if;

  select * into lead_row
  from public.crm_leads
  where id = p_lead_id;

  if lead_row.id is null then
    raise exception 'Lead not found or not visible';
  end if;

  if not (
    coalesce(actor.portal_role::text, actor.role) in ('timan_backend', 'timan_service')
    or (
      coalesce(actor.portal_role::text, actor.role) = 'timan_seller'
      and (
        lead_row.owner_user_id = actor.id
        or lower(coalesce(lead_row.owner_email, '')) = lower(coalesce(actor.email, ''))
      )
    )
  ) then
    raise exception 'Not allowed to edit lead machine interest';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Machine interest items must be a JSON array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where coalesce(item ->> 'interest_type', '') not in ('machine', 'equipment')
      or nullif(trim(item ->> 'machine_key'), '') is null
      or nullif(trim(item ->> 'item_key'), '') is null
      or nullif(trim(item ->> 'item_number'), '') is null
      or nullif(item ->> 'quantity', '') is null
      or (item ->> 'quantity') !~ '^[1-9][0-9]*$'
  ) then
    raise exception 'Invalid machine interest item';
  end if;

  if exists (
    select 1
    from (
      select
        item ->> 'interest_type' as interest_type,
        item ->> 'machine_key' as machine_key,
        item ->> 'item_key' as item_key,
        count(*)
      from jsonb_array_elements(p_items) item
      group by 1, 2, 3
      having count(*) > 1
    ) duplicate
  ) then
    raise exception 'Duplicate machine interest item';
  end if;

  delete from public.crm_lead_machine_interests
  where lead_id = p_lead_id;

  insert into public.crm_lead_machine_interests (
    lead_id,
    interest_type,
    machine_key,
    item_key,
    item_number,
    quantity,
    created_by_user_id
  )
  select
    p_lead_id,
    item ->> 'interest_type',
    trim(item ->> 'machine_key'),
    trim(item ->> 'item_key'),
    trim(item ->> 'item_number'),
    (item ->> 'quantity')::integer,
    actor.id
  from jsonb_array_elements(p_items) item;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.replace_crm_lead_machine_interests(uuid, jsonb) from public, anon;
grant execute on function public.replace_crm_lead_machine_interests(uuid, jsonb) to authenticated;
