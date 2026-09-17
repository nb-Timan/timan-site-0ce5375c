-- Internal, non-destructive corrections for legacy/MO machine registry rows.
-- SharePoint (SP) and MO imports remain immutable source records.
create table if not exists public.machine_registry_corrections (
  normalized_serial text primary key,
  dealer_account_id uuid references public.dealer_accounts(id),
  approved_warranty_registration_id uuid references public.warranty_registrations(id),
  machine_model text,
  delivery_date date,
  created_by_user_id uuid references public.app_users(id),
  updated_by_user_id uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(normalized_serial)) > 0)
);

create table if not exists public.machine_registry_correction_history (
  id uuid primary key default gen_random_uuid(),
  normalized_serial text not null,
  actor_user_id uuid references public.app_users(id),
  actor_email text,
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (length(btrim(normalized_serial)) > 0)
);

create index if not exists machine_registry_correction_history_serial_created_idx
  on public.machine_registry_correction_history(normalized_serial, created_at desc);

alter table public.machine_registry_corrections enable row level security;
alter table public.machine_registry_correction_history enable row level security;
revoke all on public.machine_registry_corrections, public.machine_registry_correction_history from public, anon;
grant select on public.machine_registry_corrections, public.machine_registry_correction_history to authenticated;

-- Read access follows the existing internal technical-service role boundary.
create or replace function public.machine_registry_correction_actor()
returns public.app_users
language sql stable security definer set search_path = public
as $$
  select au
  from public.app_users au
  where coalesce(au.approved, false)
    and coalesce(au.is_active, false)
    and (au.auth_user_id = auth.uid()
      or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', ''))))
  order by case when au.auth_user_id = auth.uid() then 0 else 1 end
  limit 1
$$;

create or replace function public.machine_registry_can_correct()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where coalesce(au.approved, false)
      and coalesce(au.is_active, false)
      and (au.auth_user_id = auth.uid()
        or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', ''))))
      and (
        au.portal_role = 'timan_backend'
        or (
          au.portal_role in ('timan_seller', 'timan_service')
          and (
            'teknik_service' = any(coalesce(au.allowed_modules, '{}'::text[]))
            or 'teknik_service' = any(coalesce(au.module_access, '{}'::text[]))
            or 'teknik_service' = any(coalesce(au.allowed_areas, '{}'::text[]))
          )
        )
      )
  )
$$;

create policy machine_registry_corrections_internal_select
  on public.machine_registry_corrections for select to authenticated
  using ((select public.machine_registry_can_correct()));
create policy machine_registry_correction_history_internal_select
  on public.machine_registry_correction_history for select to authenticated
  using ((select public.machine_registry_can_correct()));

create or replace function public.save_machine_registry_correction(p_serial text, p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_serial text := upper(regexp_replace(coalesce(p_serial, ''), '[^A-Za-z0-9]+', '', 'g'));
  v_actor public.app_users%rowtype;
  v_source public.warranty_registrations%rowtype;
  v_old public.machine_registry_corrections%rowtype;
  v_dealer_id uuid;
  v_warranty_id uuid;
  v_model text;
  v_delivery date;
  v_new public.machine_registry_corrections%rowtype;
begin
  if auth.uid() is null or not public.machine_registry_can_correct() then
    raise exception 'Machine registry correction requires internal Teknik & Service access' using errcode = '42501';
  end if;
  if v_serial = '' then
    raise exception 'Machine serial is required' using errcode = '22023';
  end if;
  select * into v_actor from public.machine_registry_correction_actor();
  select * into v_source from public.warranty_registrations wr
   where wr.is_active_in_source
     and upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) = v_serial
   order by (wr.source <> 'legacy_machine_import') desc, wr.created_at desc
   limit 1;
  if not found then
    raise exception 'Machine does not exist in the registry' using errcode = 'P0002';
  end if;

  select * into v_old from public.machine_registry_corrections where normalized_serial = v_serial;
  v_dealer_id := nullif(p_patch ->> 'dealer_account_id', '')::uuid;
  v_warranty_id := nullif(p_patch ->> 'approved_warranty_registration_id', '')::uuid;
  v_model := nullif(btrim(coalesce(p_patch ->> 'machine_model', '')), '');
  v_delivery := nullif(p_patch ->> 'delivery_date', '')::date;

  if v_dealer_id is not null and not exists (
    select 1 from public.dealer_accounts da
     where da.id = v_dealer_id and coalesce(da.is_active, true)
       and not coalesce(da.is_deleted, false) and not coalesce(da.is_blocked, false)
  ) then
    raise exception 'Choose an active dealer account' using errcode = '22023';
  end if;
  if v_warranty_id is not null and not exists (
    select 1 from public.warranty_registrations wr
     where wr.id = v_warranty_id and wr.is_active_in_source
       and wr.source <> 'legacy_machine_import'
       and upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) = v_serial
  ) then
    raise exception 'Approved warranty must belong to this machine' using errcode = '22023';
  end if;

  insert into public.machine_registry_corrections (
    normalized_serial, dealer_account_id, approved_warranty_registration_id,
    machine_model, delivery_date, created_by_user_id, updated_by_user_id
  ) values (v_serial, v_dealer_id, v_warranty_id, v_model, v_delivery, v_actor.id, v_actor.id)
  on conflict (normalized_serial) do update set
    dealer_account_id = excluded.dealer_account_id,
    approved_warranty_registration_id = excluded.approved_warranty_registration_id,
    machine_model = excluded.machine_model,
    delivery_date = excluded.delivery_date,
    updated_by_user_id = excluded.updated_by_user_id,
    updated_at = now()
  returning * into v_new;

  insert into public.machine_registry_correction_history(normalized_serial, actor_user_id, actor_email, old_values, new_values)
  values (v_serial, v_actor.id, v_actor.email,
    coalesce(to_jsonb(v_old) - array['created_at','updated_at'], '{}'::jsonb),
    to_jsonb(v_new) - array['created_at','updated_at']);

  insert into public.audit_log(actor_user_id, actor_email, actor_name, actor_role, action, module, record_type, record_id, record_label, old_value, new_value, changed_fields, status)
  values (v_actor.id, v_actor.email, coalesce(v_actor.display_name, v_actor.full_name, v_actor.email), v_actor.portal_role::text,
    'update', 'service', 'machine_registry_correction', v_serial, v_source.machine_serial_number,
    coalesce(to_jsonb(v_old), '{}'::jsonb), to_jsonb(v_new), array['dealer_account_id','approved_warranty_registration_id','machine_model','delivery_date'], 'success');
  return to_jsonb(v_new);
end
$fn$;

revoke all on function public.machine_registry_correction_actor() from public;
revoke all on function public.machine_registry_can_correct() from public;
revoke all on function public.save_machine_registry_correction(text, jsonb) from public, anon;
grant execute on function public.save_machine_registry_correction(text, jsonb) to authenticated;
