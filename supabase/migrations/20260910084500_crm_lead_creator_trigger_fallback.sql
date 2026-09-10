-- Service-role and migration jobs do not always have an auth.uid() that maps
-- to app_users. In that case preserve their explicit canonical creator id.
create or replace function public.stamp_crm_lead_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  session_creator_id uuid;
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    select au.id
      into session_creator_id
      from public.app_users au
     where au.auth_user_id = auth.uid()
     limit 1;

    if session_creator_id is not null then
      new.created_by_user_id := session_creator_id;
    end if;
  elsif tg_op = 'UPDATE' then
    new.created_by_user_id := old.created_by_user_id;
  end if;

  return new;
end;
$$;
