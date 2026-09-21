-- Integration regression for the documented O-7010 case. Always rolls back.
begin;
do $$
declare
  target_id uuid;
  revision_id uuid;
  backend_user public.app_users;
  seller public.app_users;
  external_user public.app_users;
  result jsonb;
  before_hash text;
begin
  select id into strict target_id from public.configurations where order_number='O-7010';
  select id into strict revision_id from public.configurator_order_correction_sessions
  where configuration_id=target_id and status='completed' order by completed_at desc limit 1;
  select * into strict backend_user from public.app_users
  where auth_user_id=(select actor_auth_user_id from public.configurator_order_correction_sessions where id=revision_id)
    and portal_role='timan_backend' and approved and is_active limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',backend_user.auth_user_id,'email',backend_user.email,'role','authenticated')::text,true);
  result := public.read_submitted_order_confirmation(target_id,backend_user.id);
  if (result->>'revision_number')::integer <> 3 or (result#>>'{snapshot,configuration,total_price}')::numeric <> 52725 then
    raise exception 'Latest completed AFTER regression';
  end if;
  select md5(before_snapshot::text || after_snapshot::text) into before_hash from public.configurator_order_correction_sessions where id=revision_id;

  -- Newer expired and incomplete attempts must not replace the completed document.
  insert into public.configurator_order_correction_sessions(configuration_id,actor_auth_user_id,actor_user_id,reason,before_snapshot,status,started_at)
  values(target_id,backend_user.auth_user_id,backend_user.id,'TEST ROLLBACK ONLY','{}','expired',now()),
        (target_id,backend_user.auth_user_id,backend_user.id,'TEST ROLLBACK ONLY','{}','active',now()+interval '1 second');
  if public.read_submitted_order_confirmation(target_id)->>'revision_id' <> revision_id::text then raise exception 'Incomplete revision was selected'; end if;

  perform public.record_order_revision_confirmation(revision_id,'generated',backend_user.id,'QA/rollback.pdf');
  perform public.record_order_revision_confirmation(revision_id,'begin_send',backend_user.id,'QA/rollback.pdf');
  begin
    perform public.record_order_revision_confirmation(revision_id,'begin_send',backend_user.id);
    raise exception 'Duplicate send claim accepted';
  exception when unique_violation then null; end;
  perform public.record_order_revision_confirmation(revision_id,'sent',backend_user.id);
  if before_hash <> (select md5(before_snapshot::text || after_snapshot::text) from public.configurator_order_correction_sessions where id=revision_id) then
    raise exception 'Confirmation metadata mutated immutable snapshots';
  end if;

  select * into strict external_user from public.app_users where portal_role='timan_dealer' and approved and is_active limit 1;
  begin
    perform public.read_submitted_order_confirmation(target_id,external_user.id);
    raise exception 'External View-as read allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.record_order_revision_confirmation(revision_id,'generated',external_user.id);
    raise exception 'External View-as write allowed';
  exception when insufficient_privilege then null; end;

  select * into strict seller from public.app_users where portal_role='timan_seller' and approved and is_active
    and id <> (select assigned_seller_id from public.configurations where id=target_id)
    and lower(email) <> lower((select seller_email from public.configurations where id=target_id))
    and id is distinct from (select created_by_user_id from public.configurations where id=target_id)
    and auth_user_id is distinct from (select created_by_user_id from public.configurations where id=target_id) limit 1;
  begin
    perform public.read_submitted_order_confirmation(target_id,seller.id);
    raise exception 'Unrelated seller allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',seller.auth_user_id,'email',seller.email,'role','authenticated')::text,true);
  begin
    perform public.record_order_revision_confirmation(revision_id,'generated',seller.id);
    raise exception 'Seller revision allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.read_submitted_order_confirmation(target_id,backend_user.id);
    raise exception 'Seller impersonation allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',backend_user.auth_user_id,'email',backend_user.email,'role','authenticated')::text,true);
  update public.configurator_order_correction_sessions set status='expired' where id=revision_id;
  result := public.read_submitted_order_confirmation(target_id);
  if (result->>'revision_number')::integer <> 0 or (result#>>'{snapshot,configuration,total_price}')::numeric <> 50025 then
    raise exception 'Original submitted BEFORE fallback regression';
  end if;
end;
$$;
select 'PASS: latest completed, expired/incomplete ignored, original fallback, send dedupe, immutable history, seller isolation, View-as and Backend-only' as verification;
rollback;
