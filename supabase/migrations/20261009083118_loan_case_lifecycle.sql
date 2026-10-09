-- Safe cancellation retains the U-number, source rows, private evidence and audit.
alter table public.loan_cases
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.app_users(id),
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_request_id uuid;
create unique index if not exists loan_cases_cancellation_request_unique
  on public.loan_cases(cancellation_request_id) where cancellation_request_id is not null;

create or replace function public.loan_has_operational_history(p_case_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.loan_acceptances a
      where a.case_id=p_case_id and a.acceptance_state='ACCEPTED')
    or exists(select 1 from public.loan_case_versions v
      where v.case_id=p_case_id and v.status_snapshot in
        ('ACCEPTED','ON_LOAN','RETURN_INSPECTION','CLOSED_OK','CLOSED_WITH_DEVIATION'))
    or exists(select 1 from public.loan_return_inspections r where r.case_id=p_case_id)
    or exists(select 1 from public.loan_case_events e where e.case_id=p_case_id and (
      e.from_status in ('ACCEPTED','ON_LOAN','RETURN_INSPECTION','CLOSED_OK','CLOSED_WITH_DEVIATION')
      or e.to_status in ('ACCEPTED','ON_LOAN','RETURN_INSPECTION','CLOSED_OK','CLOSED_WITH_DEVIATION')
      or e.event_type in ('VERSION_ACCEPTED','HANDED_OUT','HANDOVER_COMPLETED','ASSET_RECEIVED','ASSET_RETURN_REVIEW_REQUIRED')
    ));
$$;
revoke all on function public.loan_has_operational_history(uuid) from public,anon,authenticated;

create or replace function public.loan_can_cancel_unissued_case(p_case_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_administer_loans() and public.loan_can_view_case(p_case_id)
    and exists(select 1 from public.loan_cases c where c.id=p_case_id
      and c.status in ('DRAFT','READY_FOR_REVIEW','AWAITING_ACCEPTANCE'))
    and not public.loan_has_operational_history(p_case_id);
$$;
revoke all on function public.loan_can_cancel_unissued_case(uuid) from public,anon,authenticated;

create or replace function public.loan_list_case_lifecycle_states()
returns table(case_id uuid,can_cancel_draft boolean,last_received_at timestamptz,
  cancelled_at timestamptz,cancellation_reason text)
language sql stable security definer set search_path = '' as $$
  select c.id,public.loan_can_cancel_unissued_case(c.id),(
    select max(ri.returned_at) from public.loan_return_item_inspections ri
    join public.loan_return_inspections r on r.id=ri.return_inspection_id
    where r.case_id=c.id and r.inspection_status='COMPLETED' and ri.receipt_status='RECEIVED'
  ),c.cancelled_at,c.cancellation_reason
  from public.loan_cases c where public.loan_can_view_case(c.id);
$$;
revoke all on function public.loan_list_case_lifecycle_states() from public,anon;
grant execute on function public.loan_list_case_lifecycle_states() to authenticated;

create or replace function public.loan_cancel_unissued_case(
  p_case_id uuid,p_expected_updated_at timestamptz,p_reason text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_case public.loan_cases%rowtype;
  v_reason text:=nullif(btrim(p_reason),'');
  v_released integer;
begin
  v_actor:=public.loan_actor_id();
  if v_actor is null or not public.can_administer_loans() then
    raise exception 'Backend loan administration required' using errcode='42501';
  end if;
  if v_reason is null or length(v_reason)>500 then raise exception 'A cancellation reason of 1-500 characters is required'; end if;
  if p_request_id is null then raise exception 'A cancellation request ID is required'; end if;
  select * into v_case from public.loan_cases where id=p_case_id for update;
  if v_case.id is null or not public.loan_can_view_case(p_case_id) then raise exception 'Loan case not found'; end if;
  if v_case.status='CANCELLED' and v_case.cancellation_request_id=p_request_id then
    if v_case.cancelled_by is distinct from v_actor or v_case.cancellation_reason is distinct from v_reason then
      raise exception 'Cancellation request was already used with different input';
    end if;
    return v_case.id;
  end if;
  if p_expected_updated_at is null or p_expected_updated_at is distinct from v_case.updated_at then
    raise exception 'Loan case changed. Reload before cancellation' using errcode='40001';
  end if;
  if not public.loan_can_cancel_unissued_case(p_case_id) then
    raise exception 'Only a never-issued loan can be cancelled';
  end if;
  perform a.id from public.loan_asset_allocations a
    join public.loan_case_items i on i.id=a.case_item_id
    where i.case_id=p_case_id and a.allocation_status='active' order by a.id for update of a;
  update public.loan_asset_allocations a
    set allocation_status='released',released_by=v_actor,released_at=now(),release_reason='DRAFT_CANCELLED'
    from public.loan_case_items i where i.id=a.case_item_id and i.case_id=p_case_id and a.allocation_status='active';
  get diagnostics v_released=row_count;
  update public.loan_cases set status='CANCELLED',cancelled_at=now(),cancelled_by=v_actor,
    cancellation_reason=v_reason,cancellation_request_id=p_request_id,updated_at=now() where id=p_case_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,from_status,to_status,metadata)
    values(p_case_id,'CASE_CANCELLED',v_actor,v_case.status,'CANCELLED',jsonb_build_object(
      'loan_number',v_case.loan_number,'reason',v_reason,'previous_status',v_case.status,
      'released_allocation_count',v_released,'request_id',p_request_id));
  return p_case_id;
end;
$$;
revoke all on function public.loan_cancel_unissued_case(uuid,timestamptz,text,uuid) from public,anon;
grant execute on function public.loan_cancel_unissued_case(uuid,timestamptz,text,uuid) to authenticated;

-- Current allocations can be released; the historical case/asset links cannot disappear.
create or replace function public.loan_protect_closed_case_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_case_id uuid; v_status text;
begin
  if tg_table_name='loan_cases' then
    if tg_op='DELETE' then raise exception 'Loan history cannot be hard-deleted. Cancel a never-issued draft instead'; end if;
    if old.status in ('CLOSED_OK','CLOSED_WITH_DEVIATION','CANCELLED') and new is distinct from old then
      raise exception 'Closed loan history is read-only';
    end if;
    return new;
  end if;
  v_case_id:=case when tg_op='INSERT' then new.case_id else old.case_id end;
  select status into v_status from public.loan_cases where id=v_case_id for update;
  if v_status in ('CLOSED_OK','CLOSED_WITH_DEVIATION','CANCELLED') then
    raise exception 'Closed loan asset and photo history is read-only';
  end if;
  if tg_op='UPDATE' and new.case_id is distinct from old.case_id then
    select status into v_status from public.loan_cases where id=new.case_id for update;
    if v_status in ('CLOSED_OK','CLOSED_WITH_DEVIATION','CANCELLED') then
      raise exception 'Closed loan asset and photo history is read-only';
    end if;
  end if;
  if tg_table_name='loan_case_items' and tg_op='DELETE' and (
    v_status in ('ACCEPTED','ON_LOAN','RETURN_INSPECTION') or public.loan_has_operational_history(v_case_id)) then
    raise exception 'Operational loan asset history cannot be deleted';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.loan_protect_closed_case_history() from public,anon,authenticated;
create trigger loan_case_closed_history_guard before update or delete on public.loan_cases
  for each row execute function public.loan_protect_closed_case_history();
create trigger loan_item_closed_history_guard before insert or update or delete on public.loan_case_items
  for each row execute function public.loan_protect_closed_case_history();
create trigger loan_photo_closed_history_guard before insert or update or delete on public.loan_case_item_photos
  for each row execute function public.loan_protect_closed_case_history();

create or replace function public.loan_media_case_is_open(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.loan_can_manage_case(public.loan_storage_case_id(p_path)) and exists(
    select 1 from public.loan_cases c where c.id=public.loan_storage_case_id(p_path)
      and c.status not in ('CLOSED_OK','CLOSED_WITH_DEVIATION','CANCELLED'));
$$;
revoke all on function public.loan_media_case_is_open(text) from public,anon;
grant execute on function public.loan_media_case_is_open(text) to authenticated;
create policy loan_closed_media_insert_guard on storage.objects as restrictive for insert to authenticated
  with check(bucket_id<>'loan-case-media' or public.loan_media_case_is_open(name));
create policy loan_closed_media_update_guard on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'loan-case-media' or public.loan_media_case_is_open(name))
  with check(bucket_id<>'loan-case-media' or public.loan_media_case_is_open(name));
create policy loan_closed_media_delete_guard on storage.objects as restrictive for delete to authenticated
  using(bucket_id<>'loan-case-media' or public.loan_media_case_is_open(name));

comment on column public.loan_cases.cancellation_reason is 'Backend cancellation of a never-issued loan. Case, U-number, private photos and append-only events are retained.';
