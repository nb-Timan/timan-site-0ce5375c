-- Keep Knowledge Base audit actors canonical and server-derived. Client payloads
-- cannot impersonate another creator or approver.

create or replace function public.support_validate_knowledge_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor_user_id uuid;
begin
  select u.id
  into v_actor_user_id
  from public.app_users as u
  where auth.uid() is not null
    and (
      u.auth_user_id = auth.uid()
      or lower(u.email) = lower(nullif(auth.jwt() ->> 'email', ''))
    )
    and u.portal_role::text = 'timan_backend'
    and coalesce(u.approved, false) = true
    and coalesce(u.is_active, false) = true
    and coalesce((u.permissions ->> 'support_access')::boolean, false) = true
  limit 1;

  if v_actor_user_id is null then
    raise exception 'Support knowledge actor could not be resolved'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.created_by_user_id := v_actor_user_id;
  else
    new.created_by_user_id := coalesce(old.created_by_user_id, v_actor_user_id);
    new.created_at := old.created_at;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not (
      (old.status = 'DRAFT' and new.status in ('REVIEW', 'ARCHIVED')) or
      (old.status = 'REVIEW' and new.status in ('DRAFT', 'APPROVED', 'ARCHIVED')) or
      (old.status = 'APPROVED' and new.status in ('REVIEW', 'ARCHIVED')) or
      (old.status = 'ARCHIVED' and new.status = 'DRAFT')
    ) then
      raise exception 'Invalid support knowledge lifecycle transition: % -> %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' and (
    new.title is distinct from old.title or
    new.content is distinct from old.content or
    new.summary is distinct from old.summary or
    new.status is distinct from old.status or
    new.access_scope is distinct from old.access_scope or
    new.source_reference is distinct from old.source_reference
  ) then
    new.version_number := old.version_number + 1;
  end if;

  if new.status = 'APPROVED' and (tg_op = 'INSERT' or old.status is distinct from 'APPROVED') then
    new.approved_by_user_id := v_actor_user_id;
    new.approved_at := now();
  elsif new.status <> 'APPROVED' then
    new.approved_at := null;
    new.approved_by_user_id := null;
  elsif tg_op = 'UPDATE' then
    new.approved_by_user_id := old.approved_by_user_id;
    new.approved_at := old.approved_at;
  end if;

  return new;
end;
$$;

revoke all on function public.support_validate_knowledge_lifecycle() from public, anon, authenticated, service_role;
