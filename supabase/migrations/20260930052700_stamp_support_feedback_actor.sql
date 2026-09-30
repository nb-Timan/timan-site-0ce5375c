create or replace function private.support_feedback_stamp_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid;
begin
  v_actor_user_id := private.support_feedback_actor_user_id();
  if v_actor_user_id is null then
    raise exception 'Support feedback actor not found' using errcode = '42501';
  end if;

  new.submitted_by_user_id := v_actor_user_id;
  return new;
end;
$$;

revoke all on function private.support_feedback_stamp_actor() from public, anon, authenticated, service_role;

drop trigger if exists support_feedback_stamp_actor on public.support_feedback;
create trigger support_feedback_stamp_actor
before insert or update on public.support_feedback
for each row execute function private.support_feedback_stamp_actor();

comment on function private.support_feedback_stamp_actor() is
  'Stamps Support answer feedback with the canonical authenticated application user.';
