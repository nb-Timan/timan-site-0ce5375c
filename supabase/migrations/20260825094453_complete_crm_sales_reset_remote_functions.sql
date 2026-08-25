-- Complete CRM sales reset support.
--
-- Keeps master data intact: users/auth/roles, dealers, products, machines,
-- prices, marketing/news, translations, configurator setup and system settings.
-- Resets only CRM/sales transaction data plus CRM budget transaction rows.

create table if not exists public.crm_number_sequences (
  sequence_key text primary key check (sequence_key in ('lead', 'quote', 'order')),
  prefix text not null,
  next_number integer not null,
  updated_at timestamptz not null default now()
);

alter table public.crm_number_sequences enable row level security;

insert into public.crm_number_sequences (sequence_key, prefix, next_number)
values
  ('lead', 'L', 1001),
  ('quote', 'T', 4001),
  ('order', 'O', 7001)
on conflict (sequence_key) do update
set prefix = excluded.prefix,
    next_number = least(public.crm_number_sequences.next_number, excluded.next_number),
    updated_at = now();

create table if not exists public.crm_sales_reset_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('preview', 'execute')),
  actor_user_id uuid default auth.uid(),
  counts jsonb not null default '{}'::jsonb,
  confirmation text,
  created_at timestamptz not null default now()
);

alter table public.crm_sales_reset_audit_log enable row level security;

create or replace function public.can_manage_crm_sales_reset()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and coalesce(au.is_active, true) = true
      and coalesce(au.approved, true) = true
      and (
        au.portal_role::text = 'timan_backend'
        or coalesce((au.permissions ->> 'crm_manage')::boolean, false) = true
        or coalesce((au.permissions ->> 'admin')::boolean, false) = true
      )
  );
$$;

revoke all on function public.can_manage_crm_sales_reset() from public;
revoke all on function public.can_manage_crm_sales_reset() from anon;
grant execute on function public.can_manage_crm_sales_reset() to authenticated;

create or replace function public.next_crm_sequence_value(p_sequence_key text)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  if p_sequence_key not in ('lead', 'quote', 'order') then
    raise exception 'Unknown CRM sequence key: %', p_sequence_key;
  end if;

  update public.crm_number_sequences
     set next_number = next_number + 1,
         updated_at = now()
   where sequence_key = p_sequence_key
   returning next_number - 1 into v_next;

  if v_next is null then
    insert into public.crm_number_sequences (sequence_key, prefix, next_number)
    values (
      p_sequence_key,
      case p_sequence_key when 'lead' then 'L' when 'quote' then 'T' else 'O' end,
      case p_sequence_key when 'lead' then 1002 when 'quote' then 4002 else 7002 end
    )
    on conflict (sequence_key) do update
      set next_number = excluded.next_number,
          updated_at = now()
    returning case p_sequence_key when 'lead' then 1001 when 'quote' then 4001 else 7001 end
    into v_next;
  end if;

  return v_next;
end;
$$;

revoke all on function public.next_crm_sequence_value(text) from public;
revoke all on function public.next_crm_sequence_value(text) from anon;
grant execute on function public.next_crm_sequence_value(text) to authenticated;

create or replace function public.next_crm_document_number(p_sequence_key text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_number integer;
begin
  if p_sequence_key not in ('lead', 'quote', 'order') then
    raise exception 'Unknown CRM document sequence key: %', p_sequence_key;
  end if;

  select prefix into v_prefix
  from public.crm_number_sequences
  where sequence_key = p_sequence_key;

  if v_prefix is null then
    v_prefix := case p_sequence_key when 'lead' then 'L' when 'quote' then 'T' else 'O' end;
  end if;

  v_number := public.next_crm_sequence_value(p_sequence_key);
  return v_prefix || '-' || v_number::text;
end;
$$;

revoke all on function public.next_crm_document_number(text) from public;
revoke all on function public.next_crm_document_number(text) from anon;
grant execute on function public.next_crm_document_number(text) to authenticated;

create or replace function public.assign_crm_lead_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_no is null or new.lead_no < 1001 then
    new.lead_no := public.next_crm_sequence_value('lead');
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.crm_leads') is not null then
    drop trigger if exists assign_crm_lead_no_before_insert on public.crm_leads;
    create trigger assign_crm_lead_no_before_insert
      before insert on public.crm_leads
      for each row
      execute function public.assign_crm_lead_no();
  end if;
end $$;

create or replace function public.crm_sales_reset_table_count(p_table_name text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if to_regclass('public.' || p_table_name) is null then
    return 0;
  end if;

  execute format('select count(*) from public.%I', p_table_name) into v_count;
  return coalesce(v_count, 0);
end;
$$;

create or replace function public.preview_crm_sales_reset()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, storage
as $$
declare
  v_counts jsonb := '{}'::jsonb;
  v_table text;
  v_storage_count integer := 0;
  v_config_count integer := 0;
  v_config_item_count integer := 0;
  v_protected jsonb := '[
    "app_users/auth/roles",
    "dealer accounts/importers/service partners",
    "products/machines/accessories",
    "prices/pricelists",
    "configurator setup/drafts without CRM sales document or lead link",
    "news/marketing",
    "languages/settings",
    "warranty/service/claims"
  ]'::jsonb;
begin
  if not public.can_manage_crm_sales_reset() then
    raise exception 'Not allowed to preview CRM sales reset';
  end if;

  foreach v_table in array array[
    'crm_activities',
    'crm_calendar_activities',
    'crm_lead_attachments',
    'crm_demo_leads',
    'crm_leads',
    'crm_budget_forecasts',
    'crm_budget_sales_actuals',
    'crm_budget_dealer_lines',
    'crm_budget_entries',
    'crm_work_budget_entries',
    'crm_budget_allocations',
    'budget_entries',
    'sales_budget_entries',
    'budget_references',
    'crm_budget_lines'
  ] loop
    v_counts := v_counts || jsonb_build_object(v_table, public.crm_sales_reset_table_count(v_table));
  end loop;

  if to_regclass('public.configurations') is not null then
    execute $sql$
      select count(*)
      from public.configurations
      where quote_number is not null
         or order_number is not null
         or source_quote_id is not null
         or source_quote_number is not null
         or lead_id is not null
         or document_type in ('quote', 'order')
         or case_type in ('quote', 'order', 'offer')
         or case_status = 'ordre_afgivet'
    $sql$ into v_config_count;
  end if;
  v_counts := v_counts || jsonb_build_object('configurations_sales_documents', coalesce(v_config_count, 0));

  if to_regclass('public.configuration_items') is not null and to_regclass('public.configurations') is not null then
    execute $sql$
      select count(*)
      from public.configuration_items ci
      where exists (
        select 1
        from public.configurations c
        where c.id = ci.configuration_id
          and (
            c.quote_number is not null
            or c.order_number is not null
            or c.source_quote_id is not null
            or c.source_quote_number is not null
            or c.lead_id is not null
            or c.document_type in ('quote', 'order')
            or c.case_type in ('quote', 'order', 'offer')
            or c.case_status = 'ordre_afgivet'
          )
      )
    $sql$ into v_config_item_count;
  end if;
  v_counts := v_counts || jsonb_build_object('configuration_items_sales_documents', coalesce(v_config_item_count, 0));

  if to_regclass('storage.objects') is not null then
    select count(*) into v_storage_count
    from storage.objects
    where bucket_id = 'crm-lead-attachments';
  end if;
  v_counts := v_counts || jsonb_build_object('storage.crm-lead-attachments', coalesce(v_storage_count, 0));

  insert into public.crm_sales_reset_audit_log (action, counts)
  values ('preview', v_counts);

  return jsonb_build_object(
    'counts', v_counts,
    'next_after_reset', jsonb_build_object('lead', 'L-1001', 'quote', 'T-4001', 'order', 'O-7001'),
    'protected_data', v_protected,
    'confirmation_required', 'NULSTIL CRM'
  );
end;
$$;

revoke all on function public.preview_crm_sales_reset() from public;
revoke all on function public.preview_crm_sales_reset() from anon;
grant execute on function public.preview_crm_sales_reset() to authenticated;

create or replace function public.execute_crm_sales_reset(p_confirmation text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, storage
as $$
declare
  v_preview jsonb;
  v_table text;
  v_deleted integer := 0;
  v_deleted_counts jsonb := '{}'::jsonb;
begin
  if not public.can_manage_crm_sales_reset() then
    raise exception 'Not allowed to execute CRM sales reset';
  end if;

  if trim(coalesce(p_confirmation, '')) <> 'NULSTIL CRM' then
    raise exception 'CRM reset confirmation did not match';
  end if;

  v_preview := public.preview_crm_sales_reset();

  if to_regclass('storage.objects') is not null then
    delete from storage.objects where bucket_id = 'crm-lead-attachments';
    get diagnostics v_deleted = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('storage.crm-lead-attachments', v_deleted);
  end if;

  foreach v_table in array array[
    'crm_activities',
    'crm_calendar_activities',
    'crm_lead_attachments',
    'crm_demo_leads',
    'crm_leads',
    'crm_budget_forecasts',
    'crm_budget_sales_actuals',
    'crm_budget_dealer_lines',
    'crm_budget_entries',
    'crm_work_budget_entries',
    'crm_budget_allocations',
    'budget_entries',
    'sales_budget_entries',
    'budget_references',
    'crm_budget_lines'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('delete from public.%I', v_table);
      get diagnostics v_deleted = row_count;
      v_deleted_counts := v_deleted_counts || jsonb_build_object(v_table, v_deleted);
    end if;
  end loop;

  if to_regclass('public.configurations') is not null then
    execute $sql$
      delete from public.configurations
      where quote_number is not null
         or order_number is not null
         or source_quote_id is not null
         or source_quote_number is not null
         or lead_id is not null
         or document_type in ('quote', 'order')
         or case_type in ('quote', 'order', 'offer')
         or case_status = 'ordre_afgivet'
    $sql$;
    get diagnostics v_deleted = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('configurations_sales_documents', v_deleted);
  end if;

  insert into public.crm_number_sequences (sequence_key, prefix, next_number)
  values
    ('lead', 'L', 1001),
    ('quote', 'T', 4001),
    ('order', 'O', 7001)
  on conflict (sequence_key) do update
  set prefix = excluded.prefix,
      next_number = excluded.next_number,
      updated_at = now();

  insert into public.crm_sales_reset_audit_log (action, counts, confirmation)
  values ('execute', v_deleted_counts, p_confirmation);

  return jsonb_build_object(
    'preview_before_reset', v_preview,
    'deleted', v_deleted_counts,
    'next_after_reset', jsonb_build_object('lead', 'L-1001', 'quote', 'T-4001', 'order', 'O-7001')
  );
end;
$$;

revoke all on function public.execute_crm_sales_reset(text) from public;
revoke all on function public.execute_crm_sales_reset(text) from anon;
grant execute on function public.execute_crm_sales_reset(text) to authenticated;
