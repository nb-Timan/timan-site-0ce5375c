-- Operational per-asset receipt flow for Timan loan cases.
-- Fabric remains read-only; Supabase owns loan receipt, inspection and audit data.

alter table public.loan_return_inspections
  add column if not exists request_key uuid,
  add column if not exists request_fingerprint text;

create unique index if not exists loan_return_inspections_request_key_unique
  on public.loan_return_inspections(request_key)
  where request_key is not null;

alter table public.loan_return_item_inspections
  add column if not exists returned_by_app_user_id uuid references public.app_users(id),
  add column if not exists returned_at timestamptz,
  add column if not exists receipt_status text not null default 'RECEIVED',
  add column if not exists serial_confirmed boolean not null default false,
  add column if not exists brik_number_observed integer,
  add column if not exists brik_confirmed boolean not null default false,
  add column if not exists usage_reading_unit text,
  add column if not exists checkout_usage_reading_value numeric,
  add column if not exists calculated_usage numeric,
  add column if not exists lower_reading_explanation text,
  add column if not exists discrepancy_note text;

alter table public.loan_return_item_inspections
  drop constraint if exists loan_return_item_inspections_receipt_status_check,
  add constraint loan_return_item_inspections_receipt_status_check
    check (receipt_status in ('RECEIVED','REVIEW_REQUIRED')),
  drop constraint if exists loan_return_item_inspections_brik_number_observed_check,
  add constraint loan_return_item_inspections_brik_number_observed_check
    check (brik_number_observed is null or brik_number_observed > 0),
  drop constraint if exists loan_return_item_inspections_usage_reading_unit_check,
  add constraint loan_return_item_inspections_usage_reading_unit_check
    check (usage_reading_unit is null or usage_reading_unit in ('hours','km'));

create index if not exists loan_return_item_inspections_case_item_idx
  on public.loan_return_item_inspections(case_item_id, created_at desc);

-- Keep checkout and return media in the same private bucket while making their phases explicit.
alter table public.loan_case_item_photos
  drop constraint if exists loan_case_item_photos_photo_kind_check;
alter table public.loan_case_item_photos
  add constraint loan_case_item_photos_photo_kind_check check (photo_kind in (
    'serial_plate','hour_meter','overview','return_meter','return_condition'
  ));

-- Seal receipt evidence; later discrepancy resolution can attach a new photo without replacing history.
alter table public.loan_case_item_photos
  add column if not exists return_item_inspection_id uuid references public.loan_return_item_inspections(id);
alter table public.loan_case_item_photos
  drop constraint if exists loan_case_item_photos_case_item_id_photo_kind_key;
create unique index if not exists loan_case_item_photos_pending_kind_unique
  on public.loan_case_item_photos(case_item_id,photo_kind)
  where return_item_inspection_id is null;
create index if not exists loan_case_item_photos_return_inspection_idx
  on public.loan_case_item_photos(return_item_inspection_id);

create or replace function public.loan_protect_return_history()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name='loan_return_inspections' then
    if old.inspection_status<>'COMPLETED' then
      if tg_op='UPDATE' then return new; end if;
      return old;
    end if;
  end if;
  if tg_table_name='loan_case_item_photos' then
    if old.return_item_inspection_id is null then
      if tg_op='UPDATE' then return new; end if;
      return old;
    end if;
  end if;
  raise exception 'Completed loan receipt history is append-only';
end;
$$;
revoke all on function public.loan_protect_return_history() from public,anon,authenticated;
create trigger loan_receipt_immutable before update or delete on public.loan_return_inspections
  for each row execute function public.loan_protect_return_history();
create trigger loan_receipt_item_immutable before update or delete on public.loan_return_item_inspections
  for each row execute function public.loan_protect_return_history();
create trigger loan_receipt_photo_immutable before update or delete on public.loan_case_item_photos
  for each row execute function public.loan_protect_return_history();
create trigger loan_events_append_only before update or delete on public.loan_case_events
  for each row execute function public.loan_protect_return_history();

create or replace function public.loan_return_media_mutable(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.loan_can_manage_case(public.loan_storage_case_id(p_path))
    and not exists(select 1 from public.loan_case_item_photos p
      where p.storage_path=p_path and p.return_item_inspection_id is not null)
$$;
revoke all on function public.loan_return_media_mutable(text) from public,anon;
grant execute on function public.loan_return_media_mutable(text) to authenticated;
create or replace function public.loan_return_media_uploadable(p_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_case uuid; v_item uuid;
begin
  begin
    v_case:=public.loan_storage_case_id(p_path);
    v_item:=(string_to_array(p_path,'/'))[2]::uuid;
  exception when others then return false; end;
  return public.loan_can_manage_case(v_case) and exists(
    select 1 from public.loan_cases c
    join public.loan_case_items i on i.case_id=c.id
    join public.loan_asset_allocations a on a.case_item_id=i.id and a.allocation_status='active'
    where c.id=v_case and i.id=v_item and c.status in ('ACCEPTED','ON_LOAN','RETURN_INSPECTION')
  );
end;
$$;
revoke all on function public.loan_return_media_uploadable(text) from public,anon;
grant execute on function public.loan_return_media_uploadable(text) to authenticated;
create policy loan_return_media_insert_guard on storage.objects as restrictive
  for insert to authenticated with check (
    bucket_id<>'loan-case-media' or name not like '%/return-%'
    or public.loan_return_media_uploadable(name)
  );
create policy loan_return_media_delete_guard on storage.objects as restrictive
  for delete to authenticated using (
    bucket_id<>'loan-case-media' or name not like '%/return-%'
    or public.loan_return_media_mutable(name)
  );

create or replace function public.loan_list_case_return_states()
returns table (
  case_id uuid,
  outstanding_asset_count bigint,
  received_asset_count bigint,
  review_required_count bigint,
  can_receive boolean,
  presentation_state text
)
language sql stable security definer set search_path = '' as $$
  select c.id,
    count(i.id) filter (where exists (
      select 1 from public.loan_asset_allocations a
      where a.case_item_id=i.id and a.allocation_status='active'
    )),
    count(i.id) filter (where exists (
      select 1 from public.loan_return_item_inspections ri
      join public.loan_return_inspections r on r.id=ri.return_inspection_id
      where ri.case_item_id=i.id and r.inspection_status='COMPLETED'
        and ri.receipt_status='RECEIVED'
    )),
    count(i.id) filter (where exists (
      select 1 from public.loan_deviations d
      where d.case_item_id=i.id and d.resolution_state='OPEN'
    )),
    public.loan_can_manage_case(c.id)
      and c.status in ('ACCEPTED','ON_LOAN','RETURN_INSPECTION')
      and exists (
        select 1 from public.loan_case_items ai
        join public.loan_asset_allocations aa on aa.case_item_id=ai.id
        where ai.case_id=c.id and aa.allocation_status='active'
      ),
    case
      when c.status='CLOSED_OK' then 'RECEIVED'
      when c.status='CLOSED_WITH_DEVIATION' then 'CLOSED_WITH_DEVIATION'
      when exists (
        select 1 from public.loan_deviations d
        where d.case_id=c.id and d.resolution_state='OPEN'
      ) then 'REVIEW_REQUIRED'
      when exists (
        select 1 from public.loan_return_item_inspections ri
        join public.loan_return_inspections r on r.id=ri.return_inspection_id
        where r.case_id=c.id and r.inspection_status='COMPLETED'
          and ri.receipt_status='RECEIVED'
      ) then 'PARTIALLY_RETURNED'
      when c.status in ('ACCEPTED','ON_LOAN') then 'ON_LOAN'
      else c.status
    end
  from public.loan_cases c
  left join public.loan_case_items i on i.case_id=c.id
  where public.loan_can_view_case(c.id)
  group by c.id
  order by c.created_at desc
$$;
revoke all on function public.loan_list_case_return_states() from public, anon;
grant execute on function public.loan_list_case_return_states() to authenticated;

create or replace function public.loan_list_return_summary(p_case_id uuid)
returns table (
  case_item_id uuid,
  item_type text,
  product_sku text,
  product_name text,
  serial_number text,
  brik_number integer,
  checkout_usage_reading numeric,
  usage_reading_unit text,
  return_usage_reading numeric,
  calculated_usage numeric,
  serial_confirmed boolean,
  brik_confirmed boolean,
  receipt_status text,
  returned_at timestamptz,
  returned_by_name text,
  notes text,
  lower_reading_explanation text,
  is_outstanding boolean,
  has_return_meter_photo boolean,
  has_return_condition_photo boolean
)
language sql stable security definer set search_path = '' as $$
  select i.id,i.item_type,i.product_sku,i.product_name_snapshot,i.serial_snapshot,
    i.brik_number_snapshot,i.usage_reading_value,i.usage_reading_unit,
    latest.usage_reading_value,latest.calculated_usage,
    coalesce(latest.serial_confirmed,false),coalesce(latest.brik_confirmed,false),
    latest.receipt_status,latest.returned_at,
    coalesce(nullif(btrim(actor.display_name),''),nullif(btrim(actor.full_name),''),actor.email),
    coalesce(latest.discrepancy_note,latest.notes),latest.lower_reading_explanation,
    exists(select 1 from public.loan_asset_allocations a where a.case_item_id=i.id and a.allocation_status='active'),
    exists(select 1 from public.loan_case_item_photos p where p.return_item_inspection_id=latest.id and p.photo_kind='return_meter'),
    exists(select 1 from public.loan_case_item_photos p where p.return_item_inspection_id=latest.id and p.photo_kind='return_condition')
  from public.loan_case_items i
  left join lateral (
    select ri.* from public.loan_return_item_inspections ri
    join public.loan_return_inspections r on r.id=ri.return_inspection_id
    where ri.case_item_id=i.id and r.inspection_status='COMPLETED'
    order by ri.created_at desc,ri.id desc limit 1
  ) latest on true
  left join public.app_users actor on actor.id=latest.returned_by_app_user_id
  where i.case_id=p_case_id and public.loan_can_view_case(p_case_id)
  order by i.created_at,i.id
$$;
revoke all on function public.loan_list_return_summary(uuid) from public, anon;
grant execute on function public.loan_list_return_summary(uuid) to authenticated;

create or replace function public.loan_register_return_photo(
  p_case_id uuid,
  p_case_item_id uuid,
  p_storage_path text,
  p_photo_kind text,
  p_file_name text,
  p_content_type text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_id uuid;
begin
  v_actor:=public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then
    raise exception 'Loan return photo access denied';
  end if;
  perform 1 from public.loan_cases c
  where c.id=p_case_id and c.status in ('ACCEPTED','ON_LOAN','RETURN_INSPECTION')
  for update;
  if not found then raise exception 'Loan is not eligible for receipt'; end if;
  if not exists(
    select 1 from public.loan_case_items i
    join public.loan_asset_allocations a on a.case_item_id=i.id and a.allocation_status='active'
    where i.id=p_case_item_id and i.case_id=p_case_id
  ) then raise exception 'Asset is not outstanding'; end if;
  if p_photo_kind is null or p_photo_kind not in ('return_meter','return_condition') then raise exception 'Invalid return photo kind'; end if;
  if p_content_type is null or p_content_type not in ('image/jpeg','image/png','image/webp') then
    raise exception 'Invalid return image type';
  end if;
  if p_storage_path is null or p_storage_path not like p_case_id::text || '/' || p_case_item_id::text || '/return-%' then
    raise exception 'Invalid return photo path';
  end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='loan-case-media' and o.name=p_storage_path) then
    raise exception 'Return image upload not found';
  end if;
  if exists(select 1 from public.loan_case_item_photos p where p.case_item_id=p_case_item_id and p.photo_kind=p_photo_kind and p.return_item_inspection_id is null) then
    raise exception 'Replace the existing return photo for this category';
  end if;
  insert into public.loan_case_item_photos(case_id,case_item_id,storage_path,photo_kind,file_name,content_type,uploaded_by)
  values(p_case_id,p_case_item_id,p_storage_path,p_photo_kind,p_file_name,p_content_type,v_actor)
  returning id into v_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  values(p_case_id,'RETURN_PHOTO_ADDED',v_actor,jsonb_build_object(
    'case_item_id',p_case_item_id,'photo_kind',p_photo_kind
  ));
  return v_id;
end;
$$;
revoke all on function public.loan_register_return_photo(uuid,uuid,text,text,text,text) from public, anon;
grant execute on function public.loan_register_return_photo(uuid,uuid,text,text,text,text) to authenticated;

create or replace function public.loan_remove_return_photo(p_case_id uuid,p_photo_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_photo public.loan_case_item_photos%rowtype;
begin
  v_actor:=public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then
    raise exception 'Loan return photo access denied';
  end if;
  perform 1 from public.loan_cases c where c.id=p_case_id for update;
  select * into v_photo from public.loan_case_item_photos p
  where p.id=p_photo_id and p.case_id=p_case_id
    and p.photo_kind in ('return_meter','return_condition') for update;
  if v_photo.id is null then raise exception 'Return photo not found'; end if;
  if v_photo.return_item_inspection_id is not null then raise exception 'Completed return photos cannot be removed'; end if;
  if not exists(
    select 1 from public.loan_asset_allocations a
    where a.case_item_id=v_photo.case_item_id and a.allocation_status='active'
  ) then raise exception 'Completed return photos cannot be removed'; end if;
  delete from public.loan_case_item_photos where id=v_photo.id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  values(p_case_id,'RETURN_PHOTO_REMOVED',v_actor,jsonb_build_object(
    'case_item_id',v_photo.case_item_id,'photo_kind',v_photo.photo_kind
  ));
  return v_photo.storage_path;
end;
$$;
revoke all on function public.loan_remove_return_photo(uuid,uuid) from public, anon;
grant execute on function public.loan_remove_return_photo(uuid,uuid) to authenticated;

create or replace function public.loan_receive_assets(
  p_case_id uuid,
  p_request_key uuid,
  p_items jsonb,
  p_notes text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_case public.loan_cases%rowtype;
  v_inspection uuid;
  v_existing_case uuid;
  v_entry jsonb;
  v_item public.loan_case_items%rowtype;
  v_case_item_id uuid;
  v_serial_confirmed boolean;
  v_brik_observed integer;
  v_brik_confirmed boolean;
  v_return_reading numeric;
  v_calculated_usage numeric;
  v_needs_review boolean;
  v_note text;
  v_lower_explanation text;
  v_status text;
  v_old_status text;
  v_resolved_deviations integer;
  v_item_inspection uuid;
  v_fingerprint text;
begin
  v_actor:=public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then
    raise exception 'Loan receipt denied';
  end if;
  if p_request_key is null then raise exception 'Receipt request key is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('loan-receipt:'||p_request_key,0));
  v_fingerprint:=md5(coalesce(p_items::text,'null')||coalesce(nullif(btrim(p_notes),''),''));
  select r.case_id,r.id into v_existing_case,v_inspection
  from public.loan_return_inspections r where r.request_key=p_request_key;
  if v_inspection is not null then
    if v_existing_case<>p_case_id then raise exception 'Receipt request key belongs to another case'; end if;
    if exists(select 1 from public.loan_return_inspections r where r.id=v_inspection
      and r.request_fingerprint is distinct from v_fingerprint) then
      raise exception 'Receipt request key was reused with different input';
    end if;
    return v_inspection;
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then
    raise exception 'Select at least one asset';
  end if;
  if jsonb_array_length(p_items)=0 then
    raise exception 'Select at least one asset';
  end if;
  if jsonb_array_length(p_items)<>(
    select count(distinct value->>'case_item_id') from jsonb_array_elements(p_items)
  ) then raise exception 'Each asset may only be received once per request'; end if;

  select * into v_case from public.loan_cases where id=p_case_id for update;
  if v_case.id is null or v_case.status not in ('ACCEPTED','ON_LOAN','RETURN_INSPECTION') then
    raise exception 'Loan is not eligible for receipt';
  end if;
  v_old_status:=v_case.status;
  -- Use the canonical Fabric company plus the frozen Brik to keep component receipts together.
  if exists (
    select 1 from public.loan_case_items i
    join public.fabric_loan_assets_current f on f.asset_id=i.fabric_asset_id
    join public.loan_case_items other on other.case_id=i.case_id
      and other.brik_number_snapshot=i.brik_number_snapshot and other.id<>i.id
    join public.fabric_loan_assets_current ofa on ofa.asset_id=other.fabric_asset_id and ofa.company=f.company
    join public.loan_asset_allocations a on a.case_item_id=other.id and a.allocation_status='active'
    where i.case_id=p_case_id and i.brik_number_snapshot is not null
      and exists(select 1 from jsonb_array_elements(p_items) e where e->>'case_item_id'=i.id::text)
      and not exists(select 1 from jsonb_array_elements(p_items) e where e->>'case_item_id'=other.id::text)
      and (nullif(btrim(i.serial_snapshot),'') is null or nullif(btrim(other.serial_snapshot),'') is null)
  ) then raise exception 'Receive all outstanding components in the shared Brik group'; end if;
  insert into public.loan_return_inspections(case_id,inspected_by,inspection_status,notes,request_key,request_fingerprint)
  values(p_case_id,v_actor,'DRAFT',nullif(btrim(p_notes),''),p_request_key,v_fingerprint)
  returning id into v_inspection;

  for v_entry in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_case_item_id:=(v_entry->>'case_item_id')::uuid;
    exception when others then raise exception 'Invalid loan asset identity'; end;
    select * into v_item from public.loan_case_items i
    where i.id=v_case_item_id and i.case_id=p_case_id for update;
    if v_item.id is null then raise exception 'Loan asset not found'; end if;
    if not exists(select 1 from public.loan_asset_allocations a
      where a.case_item_id=v_item.id and a.allocation_status='active' for update) then
      raise exception 'Loan asset is not outstanding';
    end if;

    v_serial_confirmed:=coalesce((v_entry->>'serial_confirmed')::boolean,false);
    v_needs_review:=coalesce((v_entry->>'requires_review')::boolean,false);
    v_note:=nullif(btrim(v_entry->>'discrepancy_note'),'');
    v_lower_explanation:=nullif(btrim(v_entry->>'lower_reading_explanation'),'');
    v_brik_observed:=null;
    v_return_reading:=null;
    if nullif(btrim(v_entry->>'brik_number'),'') is not null then
      begin v_brik_observed:=(v_entry->>'brik_number')::integer;
      exception when others then raise exception 'Brik number must be numeric'; end;
    end if;
    if nullif(btrim(v_entry->>'return_reading'),'') is not null then
      begin v_return_reading:=(v_entry->>'return_reading')::numeric;
      exception when others then raise exception 'Return reading must be numeric'; end;
    end if;
    if v_return_reading is not null and (v_return_reading<0 or v_return_reading::text in ('NaN','Infinity','-Infinity')) then
      raise exception 'Return reading must be finite and nonnegative';
    end if;
    if v_brik_observed is not null and v_brik_observed<=0 then raise exception 'Brik number must be positive'; end if;

    if nullif(btrim(v_item.serial_snapshot),'') is not null and not v_serial_confirmed and not v_needs_review then
      raise exception 'Serial confirmation is required';
    end if;
    if v_item.brik_number_snapshot is not null and v_brik_observed is null then
      raise exception 'Observed Brik number is required';
    end if;
    v_brik_confirmed:=v_item.brik_number_snapshot is null
      or v_brik_observed=v_item.brik_number_snapshot;
    if not v_brik_confirmed and not v_needs_review then
      raise exception 'Observed Brik number does not match';
    end if;
    if v_item.usage_reading_unit is not null then
      if v_return_reading is null then raise exception 'Return meter reading is required'; end if;
      if not exists(select 1 from public.loan_case_item_photos p
        join storage.objects o on o.bucket_id='loan-case-media' and o.name=p.storage_path
        where p.case_item_id=v_item.id and p.photo_kind='return_meter' and p.return_item_inspection_id is null) then
        raise exception 'Return meter photo is required';
      end if;
      v_calculated_usage:=v_return_reading-v_item.usage_reading_value;
      if v_item.usage_reading_value is not null
        and v_return_reading<v_item.usage_reading_value
        and v_lower_explanation is null then
        raise exception 'Explain why the return reading is lower than checkout';
      end if;
    else
      v_return_reading:=null;
      v_calculated_usage:=null;
    end if;
    if v_needs_review and v_note is null then raise exception 'A discrepancy note is required'; end if;

    v_status:=case when v_needs_review then 'REVIEW_REQUIRED' else 'RECEIVED' end;
    insert into public.loan_return_item_inspections(
      return_inspection_id,case_item_id,usage_reading_value,condition_state,notes,
      returned_by_app_user_id,returned_at,receipt_status,serial_confirmed,
      brik_number_observed,brik_confirmed,usage_reading_unit,
      checkout_usage_reading_value,calculated_usage,lower_reading_explanation,discrepancy_note
    ) values (
      v_inspection,v_item.id,v_return_reading,v_status,coalesce(v_note,nullif(btrim(v_entry->>'note'),'')),
      v_actor,now(),v_status,v_serial_confirmed,v_brik_observed,v_brik_confirmed,
      v_item.usage_reading_unit,v_item.usage_reading_value,v_calculated_usage,
      v_lower_explanation,v_note
    ) returning id into v_item_inspection;

    update public.loan_case_item_photos set return_item_inspection_id=v_item_inspection
    where case_item_id=v_item.id and photo_kind in ('return_meter','return_condition')
      and return_item_inspection_id is null;

    if v_needs_review then
      insert into public.loan_deviations(case_id,case_item_id,deviation_type,description,created_by)
      values(p_case_id,v_item.id,'RETURN_REVIEW_REQUIRED',v_note,v_actor);
      insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
      values(p_case_id,'ASSET_RETURN_REVIEW_REQUIRED',v_actor,jsonb_strip_nulls(jsonb_build_object(
        'case_item_id',v_item.id,'product_sku',v_item.product_sku,
        'serial_number',v_item.serial_snapshot,'serial_confirmed',v_serial_confirmed,
        'registered_brik_number',v_item.brik_number_snapshot,'observed_brik_number',v_brik_observed,
        'return_reading',v_return_reading,'usage_unit',v_item.usage_reading_unit,
        'note',v_note
      )));
    else
      update public.loan_asset_allocations set allocation_status='released',released_by=v_actor,
        released_at=now(),release_reason='RETURN_RECEIVED'
      where case_item_id=v_item.id and allocation_status='active';
      update public.loan_deviations set resolution_state='RESOLVED',resolved_by=v_actor,resolved_at=now()
      where case_id=p_case_id and case_item_id=v_item.id and resolution_state='OPEN';
      get diagnostics v_resolved_deviations=row_count;
      insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
      values(p_case_id,'ASSET_RECEIVED',v_actor,jsonb_strip_nulls(jsonb_build_object(
        'case_item_id',v_item.id,'product_sku',v_item.product_sku,
        'serial_number',v_item.serial_snapshot,'serial_confirmed',v_serial_confirmed,
        'registered_brik_number',v_item.brik_number_snapshot,'observed_brik_number',v_brik_observed,
        'brik_confirmed',v_brik_confirmed,'checkout_reading',v_item.usage_reading_value,
        'return_reading',v_return_reading,'calculated_usage',v_calculated_usage,
        'usage_unit',v_item.usage_reading_unit,'lower_reading_explanation',v_lower_explanation,
        'note',nullif(btrim(v_entry->>'note'),''),'resolved_deviations',v_resolved_deviations
      )));
    end if;
  end loop;

  update public.loan_return_inspections
  set inspection_status='COMPLETED',inspected_at=now() where id=v_inspection;
  if exists(
    select 1 from public.loan_case_items i
    join public.loan_asset_allocations a on a.case_item_id=i.id
    where i.case_id=p_case_id and a.allocation_status='active'
  ) then
    v_status:='RETURN_INSPECTION';
  elsif exists(select 1 from public.loan_deviations d where d.case_id=p_case_id) then
    v_status:='CLOSED_WITH_DEVIATION';
  else
    v_status:='CLOSED_OK';
  end if;
  update public.loan_cases set status=v_status,updated_at=now() where id=p_case_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,from_status,to_status,metadata)
  values(p_case_id,'RETURN_RECEIPT_COMPLETED',v_actor,v_old_status,v_status,jsonb_build_object(
    'return_inspection_id',v_inspection,'request_key',p_request_key,
    'asset_count',jsonb_array_length(p_items),'notes',nullif(btrim(p_notes),'')
  ));
  return v_inspection;
end;
$$;
revoke all on function public.loan_receive_assets(uuid,uuid,jsonb,text) from public, anon;
grant execute on function public.loan_receive_assets(uuid,uuid,jsonb,text) to authenticated;

revoke insert,update,delete,truncate on public.loan_return_inspections,
  public.loan_return_item_inspections,public.loan_deviations from authenticated,anon;

comment on function public.loan_receive_assets(uuid,uuid,jsonb,text) is
  'Atomic, idempotent per-asset Loan receipt. Releases only successfully received allocations; Fabric is never written.';
comment on column public.loan_return_inspections.request_key is
  'Client-generated idempotency key for one receipt submission.';
