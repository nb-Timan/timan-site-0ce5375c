-- Current confirmation is one immutable completed AFTER, or the original BEFORE.
-- Expose only that document, never the private correction-session history.
create or replace function public.read_submitted_order_confirmation(
  p_configuration_id uuid,
  p_effective_user_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  actor public.app_users;
  effective_actor public.app_users;
  target public.configurations;
  chosen record;
  snapshot jsonb;
begin
  select * into actor from public.app_users
  where approved and is_active and (auth_user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt()->>'email', '')))
  order by (auth_user_id = auth.uid()) desc nulls last limit 1;
  if actor.id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  effective_actor := actor;
  if p_effective_user_id is not null and p_effective_user_id <> actor.id then
    if coalesce(actor.portal_role::text,'') <> 'timan_backend' then
      raise exception 'Cannot change effective user' using errcode='42501';
    end if;
    select * into effective_actor from public.app_users where id=p_effective_user_id and approved and is_active;
  end if;
  if effective_actor.id is null or coalesce(effective_actor.portal_role::text,'') not in ('timan_backend','timan_seller') then
    raise exception 'Order confirmation access denied' using errcode='42501';
  end if;
  select * into target from public.configurations where id=p_configuration_id;
  if target.id is null or not public.is_submitted_configurator_order(target) then
    raise exception 'Submitted order not found' using errcode='22023';
  end if;
  if effective_actor.portal_role::text = 'timan_seller' and not (
    target.assigned_seller_id is not distinct from effective_actor.id
    or lower(coalesce(target.seller_email,'')) = lower(effective_actor.email)
    or target.created_by_user_id is not distinct from effective_actor.id
    or (effective_actor.auth_user_id is not null and target.created_by_user_id = effective_actor.auth_user_id)
  ) then raise exception 'Order outside seller scope' using errcode='42501'; end if;

  select * into chosen from (
    select s.*, row_number() over(order by started_at,id) as revision_number
    from public.configurator_order_correction_sessions s where configuration_id=p_configuration_id
  ) revisions where status='completed' and completed_at is not null and after_snapshot is not null
  order by completed_at desc, revision_number desc limit 1;
  if found then
    return jsonb_build_object('snapshot',chosen.after_snapshot,'revision_number',chosen.revision_number,'revision_id',chosen.id);
  end if;
  select before_snapshot into snapshot from public.configurator_order_correction_sessions
  where configuration_id=p_configuration_id order by started_at,id limit 1;
  if snapshot is null then
    snapshot := jsonb_build_object('configuration',to_jsonb(target),'items',coalesce((
      select jsonb_agg(to_jsonb(i) order by sort_order,id) from public.configuration_items i where configuration_id=target.id
    ),'[]'::jsonb));
  end if;
  return jsonb_build_object('snapshot',snapshot,'revision_number',0,'revision_id',null);
end;
$$;
revoke all on function public.read_submitted_order_confirmation(uuid,uuid) from public,anon;
grant execute on function public.read_submitted_order_confirmation(uuid,uuid) to authenticated;

alter table public.configurator_order_correction_sessions
  add column if not exists confirmation_generated_at timestamptz,
  add column if not exists confirmation_send_started_at timestamptz,
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists confirmation_pdf_path text;

-- A revision can be dispatched at most once. An uncertain send is never retried automatically.
create or replace function public.record_order_revision_confirmation(
  p_revision_id uuid, p_action text, p_effective_user_id uuid default null, p_pdf_path text default null
) returns void
language plpgsql security definer set search_path=public
as $$
declare
  revision public.configurator_order_correction_sessions;
  document jsonb;
begin
  if not public.is_timan_backend() then raise exception 'Backend required' using errcode='42501'; end if;
  if p_effective_user_id is not null and not exists (
    select 1 from public.app_users where id=p_effective_user_id and approved and is_active and portal_role::text='timan_backend'
  ) then raise exception 'Backend effective role required' using errcode='42501'; end if;
  select * into revision from public.configurator_order_correction_sessions
  where id=p_revision_id and actor_auth_user_id=auth.uid() and status='completed' for update;
  if not found then raise exception 'Completed own revision required' using errcode='42501'; end if;
  document := public.read_submitted_order_confirmation(revision.configuration_id,p_effective_user_id);
  if document->>'revision_id' is distinct from p_revision_id::text then raise exception 'Revision is no longer current' using errcode='22023'; end if;
  if p_action='generated' then
    update public.configurator_order_correction_sessions set confirmation_generated_at=coalesce(confirmation_generated_at,now()), confirmation_pdf_path=coalesce(p_pdf_path,confirmation_pdf_path) where id=p_revision_id;
  elsif p_action='begin_send' then
    if revision.confirmation_send_started_at is not null then raise exception 'Confirmation send already attempted; check mail audit before retrying' using errcode='23505'; end if;
    update public.configurator_order_correction_sessions set confirmation_send_started_at=now(),confirmation_pdf_path=coalesce(p_pdf_path,confirmation_pdf_path) where id=p_revision_id;
  elsif p_action='sent' then
    if revision.confirmation_send_started_at is null then raise exception 'Send was not claimed' using errcode='22023'; end if;
    update public.configurator_order_correction_sessions set confirmation_sent_at=coalesce(confirmation_sent_at,now()) where id=p_revision_id;
  else raise exception 'Invalid confirmation action' using errcode='22023'; end if;
end;
$$;
revoke all on function public.record_order_revision_confirmation(uuid,text,uuid,text) from public,anon;
grant execute on function public.record_order_revision_confirmation(uuid,text,uuid,text) to authenticated;
